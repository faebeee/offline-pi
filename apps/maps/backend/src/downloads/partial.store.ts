import fs from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import type { Bbox, DownloadEstimate, PartialDownload, Polygon, Region } from "@outpost/maps-shared";
import { PATHS } from "../config/paths.ts";
import { cachedBytes } from "./range-cache.ts";

/**
 * What a download needs to go on after a pause, a failure or a restart.
 * Written once the user accepts the estimate, so the search result it came
 * from (which expires) is no longer needed.
 */
export type PartialState = {
  name: string;
  label: string;
  source: Region["source"];
  bbox: Bbox;
  minzoom: number;
  maxzoom: number;
  build: string;
  estimate: DownloadEstimate;
  /** the build's ETag: a resume against a changed build fails instead of mixing data */
  etag?: string;
  /** replaces an existing region of the same name when done */
  force?: boolean;
  /** "downloading" while a job runs it; found that way after a restart = interrupted */
  status: "downloading" | "paused" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Unfinished downloads, one folder each in `data/downloads/<name>/`:
 *
 *   download.json     PartialState
 *   boundary.geojson  the region's polygon (--region for pmtiles extract)
 *   ranges/           byte ranges of the build fetched so far (RangeCache)
 *   <name>.pmtiles    the archive while pmtiles writes it
 *
 * The folder is removed when the region is done or the download cancelled.
 */
@Injectable()
export class PartialStore {
  dir(name: string): string {
    return path.join(PATHS.downloadsDir, name);
  }

  rangesDir(name: string): string {
    return path.join(this.dir(name), "ranges");
  }

  boundaryFile(name: string): string {
    return path.join(this.dir(name), "boundary.geojson");
  }

  archiveFile(name: string): string {
    return path.join(this.dir(name), `${name}.pmtiles`);
  }

  async create(state: PartialState, boundary: Polygon): Promise<void> {
    await fs.mkdir(this.rangesDir(state.name), { recursive: true });
    await fs.writeFile(this.boundaryFile(state.name), JSON.stringify(boundary));
    await this.write(state);
  }

  async read(name: string): Promise<PartialState | undefined> {
    try {
      const raw = await fs.readFile(path.join(this.dir(name), "download.json"), "utf8");
      return JSON.parse(raw) as PartialState;
    } catch {
      return undefined;
    }
  }

  async boundary(name: string): Promise<Polygon> {
    return JSON.parse(await fs.readFile(this.boundaryFile(name), "utf8")) as Polygon;
  }

  /** Merges `patch` into the stored state. */
  async update(name: string, patch: Partial<PartialState>): Promise<PartialState | undefined> {
    const state = await this.read(name);
    if (!state) return undefined;
    const next = { ...state, ...patch, updatedAt: new Date().toISOString() };
    await this.write(next);
    return next;
  }

  async list(): Promise<PartialState[]> {
    let names: string[];
    try {
      names = await fs.readdir(PATHS.downloadsDir);
    } catch {
      return [];
    }
    const states: PartialState[] = [];
    for (const name of names) {
      const state = await this.read(name);
      if (state) states.push(state);
    }
    return states.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async remove(name: string): Promise<void> {
    await fs.rm(this.dir(name), { recursive: true, force: true });
  }

  downloadedBytes(name: string): Promise<number> {
    return cachedBytes(this.rangesDir(name));
  }

  /** The API view. */
  async view(state: PartialState): Promise<PartialDownload> {
    return {
      name: state.name,
      label: state.label,
      minzoom: state.minzoom,
      maxzoom: state.maxzoom,
      build: state.build,
      estimate: state.estimate,
      downloadedBytes: await this.downloadedBytes(state.name),
      // "downloading" without a job (the caller skips the running one): cut off by a restart
      reason: state.status === "downloading" ? "interrupted" : state.status,
      ...(state.error ? { error: state.error } : {}),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  private async write(state: PartialState): Promise<void> {
    const file = path.join(this.dir(state.name), "download.json");
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
    await fs.rename(tmp, file);
  }
}
