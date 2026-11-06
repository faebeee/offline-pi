import fs from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import type { Bbox, Region } from "@offline-maps/shared";
import { PATHS } from "../config/paths.ts";

type RegistryFile = { regions: Region[] };

/** Reads and writes `data/regions.json`, the list of downloaded regions. */
@Injectable()
export class RegistryService {
  regionFile(name: string): string {
    return path.join(PATHS.regionsDir, `${name}.pmtiles`);
  }

  async readAll(): Promise<Region[]> {
    try {
      const raw = await fs.readFile(PATHS.registry, "utf8");
      const parsed = JSON.parse(raw) as RegistryFile;
      return parsed.regions ?? [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async get(name: string): Promise<Region | undefined> {
    return (await this.readAll()).find((r) => r.name === name);
  }

  /** Regions whose archive is actually on disk. */
  async readAvailable(): Promise<Region[]> {
    const regions = await this.readAll();
    const available: Region[] = [];
    for (const region of regions) {
      try {
        await fs.access(this.regionFile(region.name));
        available.push(region);
      } catch {
        // archive deleted from disk — hide it rather than serving broken tiles
      }
    }
    return available;
  }

  async upsert(region: Region): Promise<void> {
    const regions = (await this.readAll()).filter((r) => r.name !== region.name);
    regions.push(region);
    await this.write(regions);
  }

  async remove(name: string): Promise<Region | undefined> {
    const regions = await this.readAll();
    const found = regions.find((r) => r.name === name);
    if (!found) return undefined;
    await this.write(regions.filter((r) => r.name !== name));
    return found;
  }

  private async write(regions: Region[]): Promise<void> {
    const sorted = [...regions].sort((a, b) => a.name.localeCompare(b.name));
    await fs.mkdir(PATHS.data, { recursive: true });
    await fs.writeFile(PATHS.registry, `${JSON.stringify({ regions: sorted }, null, 2)}\n`);
  }
}

export function bboxCenter(bbox: Bbox): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/** Slugify a place name into a region id: "Baden-Württemberg" -> "baden-wurttemberg" */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
