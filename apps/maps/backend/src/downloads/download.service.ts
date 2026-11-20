import fs from "node:fs/promises";
import path from "node:path";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import {
  MAX_ZOOM,
  DEFAULT_MAXZOOM,
  type CreateDownloadRequest,
  type DownloadEstimate,
  type Job,
  type PartialDownload,
  type Region,
} from "@outpost/maps-shared";
import { PATHS } from "../config/paths.ts";
import { UPSTREAM } from "../config/upstream.ts";
import { exists, moveDir } from "../common/files.ts";
import { formatBytes } from "../common/terminal.ts";
import type { JobContext } from "../jobs/job.record.ts";
import { JobsService } from "../jobs/jobs.service.ts";
import { PlanetBuildService } from "../places/build.service.ts";
import { simplifyPolygon } from "../places/geometry.ts";
import type { Place } from "../places/places.service.ts";
import { PlacesService } from "../places/places.service.ts";
import { ArchiveService } from "../regions/archive.service.ts";
import { bboxCenter, RegistryService } from "../regions/registry.service.ts";
import { PmtilesService } from "../tools/pmtiles.service.ts";
import { PartialStore, type PartialState } from "./partial.store.ts";
import { startRangeCache } from "./range-cache.ts";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Plan = {
  place: Place;
  name: string;
  minzoom: number;
  maxzoom: number;
  build?: string;
  force?: boolean;
};

/**
 * The add-a-region pipeline: resolve a build, measure the extract, wait for
 * the user to accept the size, then download. Every step reports into a job
 * so the UI can follow along.
 *
 * Once accepted, a download is resumable: its state and every byte range it
 * fetched live in `data/downloads/<name>/` (PartialStore, RangeCache). A
 * failure, a pause or a restart keeps them; `resume` goes on from there, and
 * only a cancel (or `discard`) deletes them.
 */
@Injectable()
export class DownloadService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DownloadService.name);

  constructor(
    private readonly places: PlacesService,
    private readonly builds: PlanetBuildService,
    private readonly registry: RegistryService,
    private readonly archives: ArchiveService,
    private readonly pmtiles: PmtilesService,
    private readonly jobs: JobsService,
    private readonly partials: PartialStore,
  ) {}

  /** A half-written archive of an interrupted run is useless: pmtiles rewrites it. */
  async onApplicationBootstrap(): Promise<void> {
    for (const state of await this.partials.list()) {
      await fs.rm(this.partials.archiveFile(state.name), { force: true });
      if (state.status === "downloading") {
        this.logger.warn(`download of ${state.name} was interrupted; resume it on the Maps screen`);
      }
    }
  }

  /** Validates the request up front, so bad input is a 400 and not a failed job. */
  async start(request: CreateDownloadRequest): Promise<Job> {
    await this.requirePmtiles();

    const place = this.places.candidate(request.placeId);
    if (!place) {
      throw new NotFoundException("that search result expired — search again");
    }

    const maxzoom = request.maxzoom ?? DEFAULT_MAXZOOM;
    const minzoom = request.minzoom ?? 0;
    if (!Number.isInteger(maxzoom) || maxzoom < 1 || maxzoom > MAX_ZOOM) {
      throw new BadRequestException(`maxzoom must be an integer between 1 and ${MAX_ZOOM}`);
    }
    if (!Number.isInteger(minzoom) || minzoom < 0 || minzoom > maxzoom) {
      throw new BadRequestException("minzoom must be an integer between 0 and maxzoom");
    }
    if (request.build !== undefined && !/^\d{8}$/.test(request.build)) {
      throw new BadRequestException("build must be a YYYYMMDD date");
    }

    const name = request.name ?? place.name;
    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        "name must be lowercase letters, digits and dashes, starting with a letter or digit",
      );
    }

    if ((await exists(this.registry.regionFile(name))) && !request.force) {
      throw new ConflictException(`region "${name}" already exists`);
    }
    if (await this.partials.read(name)) {
      throw new ConflictException(
        `an unfinished download of "${name}" exists: resume or cancel it first`,
      );
    }

    const plan: Plan = { place, name, minzoom, maxzoom, build: request.build, force: request.force };
    return this.jobs.start(
      "download",
      "resolving planet build",
      (ctx) => this.measure(ctx, plan),
      { name, label: place.label, minzoom, maxzoom },
    );
  }

  /** Unfinished downloads, except the one running right now. */
  async list(): Promise<PartialDownload[]> {
    const running = this.runningName();
    const states = (await this.partials.list()).filter((s) => s.name !== running);
    return Promise.all(states.map((s) => this.partials.view(s)));
  }

  /** Goes on with an unfinished download from where it stopped. */
  async resume(name: string): Promise<Job> {
    this.requireName(name);
    await this.requirePmtiles();
    const state = await this.partials.read(name);
    if (!state) throw new NotFoundException(`no unfinished download "${name}"`);
    const job = this.jobs.start(
      "download",
      "resuming download",
      async (ctx) => {
        ctx.setEstimate(state.estimate);
        await this.download(ctx, state);
      },
      { name, label: state.label, minzoom: state.minzoom, maxzoom: state.maxzoom },
    );
    return job;
  }

  /** Deletes an unfinished download and everything it fetched. */
  async discard(name: string): Promise<void> {
    this.requireName(name);
    if (this.runningName() === name) {
      throw new ConflictException(`"${name}" is downloading right now: cancel the job instead`);
    }
    if (!(await this.partials.read(name))) {
      throw new NotFoundException(`no unfinished download "${name}"`);
    }
    await this.partials.remove(name);
  }

  /** Resolves the build, measures the extract and waits for the user's OK. */
  private async measure(ctx: JobContext, plan: Plan): Promise<void> {
    const { place, name, minzoom, maxzoom } = plan;

    ctx.log(`looking up planet build for ${place.label}`);
    const build = await this.builds.resolve(plan.build);
    ctx.log(`using build ${build}`);

    await fs.mkdir(PATHS.tmp, { recursive: true });
    const polyFile = path.join(PATHS.tmp, `${name}.geojson`);
    await fs.writeFile(polyFile, JSON.stringify(place.polygon));

    let estimate: DownloadEstimate;
    try {
      ctx.setStage("estimating size", "estimating");
      const { archiveBytes, transferBytes } = await this.pmtiles.estimate(
        {
          source: UPSTREAM.build(build),
          outFile: path.join(PATHS.tmp, `${name}.pmtiles`),
          regionFile: polyFile,
          minzoom,
          maxzoom,
        },
        { signal: ctx.signal, onLog: (chunk) => ctx.log(chunk) },
      );
      if (archiveBytes === 0) {
        throw new Error("no tiles cover that boundary — try a different place");
      }

      estimate = { archiveBytes, transferBytes, build };
      const warning = await this.diskWarning(archiveBytes + transferBytes);
      if (warning) estimate.diskWarning = warning;
      ctx.setEstimate(estimate);
      ctx.log(`archive ${formatBytes(archiveBytes)}, ${formatBytes(transferBytes)} to download`);
    } finally {
      await fs.rm(polyFile, { force: true });
    }

    await ctx.awaitConfirmation();

    // From here on the download survives failures, pauses and restarts.
    const now = new Date().toISOString();
    const state: PartialState = {
      name,
      label: place.label,
      source: place.source,
      bbox: place.bbox,
      minzoom,
      maxzoom,
      build,
      estimate,
      force: plan.force,
      status: "downloading",
      createdAt: now,
      updatedAt: now,
    };
    await this.partials.create(state, place.polygon);
    await this.download(ctx, state);
  }

  /**
   * Runs the extract through the range cache and adds the region. Leaves
   * the download resumable when it fails or is paused, removes it when it is
   * cancelled.
   */
  private async download(ctx: JobContext, initial: PartialState): Promise<void> {
    const { name } = initial;
    let state = (await this.partials.update(name, { status: "downloading", error: undefined })) ?? initial;
    const total = state.estimate.transferBytes;
    let fetched = await this.partials.downloadedBytes(name);
    const report = () =>
      ctx.setProgress({
        bytes: fetched,
        total,
        // the estimate is close, not exact: 100 only once the region is added
        percent: total > 0 ? Math.min(99, Math.floor((fetched / total) * 100)) : 0,
      });

    ctx.setStage(fetched > 0 ? `downloading tiles (resumed at ${formatBytes(fetched)})` : "downloading tiles", "running");
    report();
    if (fetched > 0) ctx.log(`resuming: ${formatBytes(fetched)} already downloaded`);

    const cache = await startRangeCache({
      upstream: UPSTREAM.build(state.build),
      dir: this.partials.rangesDir(name),
      etag: state.etag,
      signal: ctx.signal,
      onBytes: (n) => {
        fetched += n;
      },
      onEtag: (etag) => {
        // the folder may be gone already (cancelled): nothing to keep then
        void this.partials
          .update(name, { etag })
          .then((s) => {
            if (s) state = s;
          })
          .catch(() => undefined);
      },
      onLog: (line) => ctx.log(line),
    });
    const ticker = setInterval(report, 1000);
    const outFile = this.partials.archiveFile(name);

    try {
      await this.pmtiles.extract(
        {
          source: cache.url,
          outFile,
          regionFile: this.partials.boundaryFile(name),
          minzoom: state.minzoom,
          maxzoom: state.maxzoom,
        },
        { signal: ctx.signal, onLog: (chunk) => ctx.log(chunk) },
      );
    } catch (err) {
      clearInterval(ticker);
      report();
      await cache.close();
      await fs.rm(outFile, { force: true });
      if (ctx.signal.aborted) {
        if (ctx.pausing()) {
          await this.partials.update(name, { status: "paused" });
          ctx.setResumable(true);
          ctx.log(`paused at ${formatBytes(fetched)}; resume it to go on from there`);
        } else {
          await this.partials.remove(name);
          ctx.log("cancelled; what was downloaded is deleted");
        }
        throw err;
      }
      // the proxy knows why a range gave up better than pmtiles' "unexpected EOF"
      const message = cache.failure() ?? (err instanceof Error ? err.message : String(err));
      await this.partials.update(name, { status: "failed", error: message });
      ctx.setResumable(true);
      throw new Error(message, { cause: err });
    }
    clearInterval(ticker);
    await cache.close();

    ctx.setStage("writing registry");
    const header = await this.pmtiles.readHeader(outFile);
    const { size } = await fs.stat(outFile);
    const regionFile = this.registry.regionFile(name);
    await fs.mkdir(PATHS.regionsDir, { recursive: true });
    // a replaced region: drop the open handle on the old file first
    await this.archives.close(name);
    await moveDir(outFile, regionFile);
    const boundary = await this.partials.boundary(name);
    const region: Region = {
      name,
      label: state.label,
      source: state.source,
      bbox: state.bbox,
      center: bboxCenter(state.bbox),
      minzoom: header.minZoom,
      maxzoom: header.maxZoom,
      build: state.build,
      bytes: size,
      addedAt: new Date().toISOString(),
      // Stored simplified: the registry is shipped to the browser on every load.
      polygon: simplifyPolygon(boundary),
    };
    await this.registry.upsert(region);
    await this.partials.remove(name);
    ctx.setProgress({ bytes: fetched, total: Math.max(total, fetched), percent: 100 });
    ctx.log(`added ${name} (${formatBytes(size)}, z${header.minZoom}–${header.maxZoom})`);
  }

  /** Names become folder names: never let one reach outside data/downloads. */
  private requireName(name: string): void {
    if (!NAME_PATTERN.test(name)) throw new NotFoundException(`no unfinished download "${name}"`);
  }

  private async requirePmtiles(): Promise<void> {
    if (!(await this.pmtiles.isInstalled())) {
      throw new ConflictException("the pmtiles binary is missing — run setup first");
    }
  }

  /** The region the running download job works on, if any. */
  private runningName(): string | undefined {
    const active = this.jobs.active();
    return active?.type === "download" ? active.region?.name : undefined;
  }

  /**
   * Warns before filling the disk, which `pmtiles extract` would happily do.
   * `bytes` covers the downloaded ranges plus the archive written from them.
   */
  private async diskWarning(bytes: number): Promise<string | undefined> {
    try {
      await fs.mkdir(PATHS.downloadsDir, { recursive: true });
      const stat = await fs.statfs(PATHS.downloadsDir);
      const free = stat.bavail * stat.bsize;
      if (bytes > free) {
        return `needs ${formatBytes(bytes)} while downloading, only ${formatBytes(free)} free on disk`;
      }
      if (bytes > free * 0.9) {
        return `this would leave under ${formatBytes(free - bytes)} free while downloading`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
