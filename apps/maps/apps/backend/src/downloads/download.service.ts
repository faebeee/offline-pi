import fs from "node:fs/promises";
import path from "node:path";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MAX_ZOOM,
  DEFAULT_MAXZOOM,
  type CreateDownloadRequest,
  type DownloadEstimate,
  type Job,
  type Region,
} from "@offline-maps/shared";
import { PATHS } from "../config/paths.ts";
import { UPSTREAM } from "../config/upstream.ts";
import { exists } from "../common/files.ts";
import { formatBytes } from "../common/terminal.ts";
import type { JobContext } from "../jobs/job.record.ts";
import { JobsService } from "../jobs/jobs.service.ts";
import { PlanetBuildService } from "../places/build.service.ts";
import { simplifyPolygon } from "../places/geometry.ts";
import type { Place } from "../places/places.service.ts";
import { PlacesService } from "../places/places.service.ts";
import { bboxCenter, RegistryService } from "../regions/registry.service.ts";
import { PmtilesService } from "../tools/pmtiles.service.ts";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Plan = {
  place: Place;
  name: string;
  minzoom: number;
  maxzoom: number;
  build?: string;
  outFile: string;
};

/**
 * The add-a-region pipeline: resolve a build, measure the extract, wait for the
 * user to accept the size, then download. Every step reports into a job so the
 * UI can follow along.
 */
@Injectable()
export class DownloadService {
  constructor(
    private readonly places: PlacesService,
    private readonly builds: PlanetBuildService,
    private readonly registry: RegistryService,
    private readonly pmtiles: PmtilesService,
    private readonly jobs: JobsService,
  ) {}

  /** Validates the request up front, so bad input is a 400 and not a failed job. */
  async start(request: CreateDownloadRequest): Promise<Job> {
    if (!(await this.pmtiles.isInstalled())) {
      throw new ConflictException("the pmtiles binary is missing — run setup first");
    }

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

    const outFile = this.registry.regionFile(name);
    if ((await exists(outFile)) && !request.force) {
      throw new ConflictException(`region "${name}" already exists`);
    }

    const plan: Plan = { place, name, minzoom, maxzoom, build: request.build, outFile };
    return this.jobs.start(
      "download",
      "resolving planet build",
      (ctx) => this.run(ctx, plan),
      { name, label: place.label, minzoom, maxzoom },
    );
  }

  private async run(ctx: JobContext, plan: Plan): Promise<void> {
    const { place, name, minzoom, maxzoom, outFile } = plan;

    ctx.log(`looking up planet build for ${place.label}`);
    const build = await this.builds.resolve(plan.build);
    ctx.log(`using build ${build}`);

    await fs.mkdir(PATHS.tmp, { recursive: true });
    await fs.mkdir(PATHS.regionsDir, { recursive: true });
    const polyFile = path.join(PATHS.tmp, `${name}.geojson`);
    await fs.writeFile(polyFile, JSON.stringify(place.polygon));

    const options = {
      source: UPSTREAM.build(build),
      outFile,
      regionFile: polyFile,
      minzoom,
      maxzoom,
    };

    try {
      ctx.setStage("estimating size", "estimating");
      const { archiveBytes, transferBytes } = await this.pmtiles.estimate(options, {
        signal: ctx.signal,
        onLog: (chunk) => ctx.log(chunk),
      });
      if (archiveBytes === 0) {
        throw new Error("no tiles cover that boundary — try a different place");
      }

      const estimate: DownloadEstimate = { archiveBytes, transferBytes, build };
      const warning = await this.diskWarning(archiveBytes);
      if (warning) estimate.diskWarning = warning;
      ctx.setEstimate(estimate);
      ctx.log(`archive ${formatBytes(archiveBytes)}, ${formatBytes(transferBytes)} to download`);

      await ctx.awaitConfirmation();

      ctx.setStage("downloading tiles", "running");
      ctx.setProgress({ bytes: 0, total: archiveBytes, percent: 0 });
      await this.pmtiles.extract(options, {
        signal: ctx.signal,
        totalBytes: archiveBytes,
        onProgress: (progress) => ctx.setProgress(progress),
        onLog: (chunk) => ctx.log(chunk),
      });

      ctx.setStage("writing registry");
      const header = await this.pmtiles.readHeader(outFile);
      const { size } = await fs.stat(outFile);
      const region: Region = {
        name,
        label: place.label,
        source: place.source,
        bbox: place.bbox,
        center: bboxCenter(place.bbox),
        minzoom: header.minZoom,
        maxzoom: header.maxZoom,
        build,
        bytes: size,
        addedAt: new Date().toISOString(),
        // Stored simplified: the registry is shipped to the browser on every load.
        polygon: simplifyPolygon(place.polygon),
      };
      await this.registry.upsert(region);
      ctx.setProgress({ bytes: size, total: size, percent: 100 });
      ctx.log(`added ${name} (${formatBytes(size)}, z${header.minZoom}–${header.maxZoom})`);
    } catch (err) {
      // A half-written archive is worse than none: the registry would point at
      // tiles that aren't there.
      await fs.rm(outFile, { force: true });
      throw err;
    } finally {
      await fs.rm(polyFile, { force: true });
    }
  }

  /** Warns before filling the disk, which `pmtiles extract` would happily do. */
  private async diskWarning(archiveBytes: number): Promise<string | undefined> {
    try {
      const stat = await fs.statfs(PATHS.regionsDir);
      const free = stat.bavail * stat.bsize;
      if (archiveBytes > free) {
        return `only ${formatBytes(free)} free on disk`;
      }
      if (archiveBytes > free * 0.9) {
        return `this would leave under ${formatBytes(free - archiveBytes)} free`;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
