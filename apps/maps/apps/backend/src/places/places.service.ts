import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { Injectable } from "@nestjs/common";
import type { Bbox, PlaceCandidate, Polygon } from "@offline-maps/shared";
import { PATHS } from "../config/paths.ts";
import { UPSTREAM } from "../config/upstream.ts";
import { exists } from "../common/files.ts";
import { download } from "../common/net.ts";
import { c, log, type Report } from "../common/terminal.ts";
import { slugify } from "../regions/registry.service.ts";
import { simplifyPolygon } from "./geometry.ts";

/** How long a search result stays downloadable, and how many we keep. */
const CANDIDATE_TTL_MS = 15 * 60 * 1000;
const MAX_CANDIDATES = 100;
/** Coarse enough to keep a country outline at a few kB. */
const PREVIEW_TOLERANCE = 0.02;

export type Place = {
  /** region id used for the filename and API routes */
  name: string;
  label: string;
  /** extra context shown when disambiguating, e.g. "Germany" or the OSM type */
  detail: string;
  source: "geofabrik" | "nominatim";
  bbox: Bbox;
  polygon: Polygon;
};

type GeofabrikFeature = {
  properties: { id: string; parent?: string; name: string };
  geometry: Polygon;
};

type NominatimResult = {
  display_name: string;
  name?: string;
  type: string;
  addresstype?: string;
  importance?: number;
  boundingbox: [string, string, string, string];
  geojson?: Polygon;
};

function titleCase(input: string): string {
  return input
    .split(/[-_\s]+/)
    .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function labelFor(f: GeofabrikFeature): string {
  // Some entries (US states) carry an id-shaped name like "us/texas".
  if (f.properties.name.includes("/")) return titleCase(f.properties.name.split("/").pop()!);
  return f.properties.name;
}

export function bboxOf(geometry: Polygon): Bbox {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const child of node) visit(child);
  };
  visit(geometry.coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

/** Rough degree span, used to warn about accidentally huge boundaries. */
export function bboxSpan(bbox: Bbox): string {
  return `${(bbox[2] - bbox[0]).toFixed(2)}° × ${(bbox[3] - bbox[1]).toFixed(2)}°`;
}

/** Resolves plain place names to boundaries, via Geofabrik then Nominatim. */
@Injectable()
export class PlacesService {
  private catalog: GeofabrikFeature[] | undefined;
  private readonly candidates = new Map<string, { place: Place; expiresAt: number }>();

  /** Downloads the Geofabrik region catalog on first use, then reads it from disk. */
  async ensureCatalog(report: Report = log): Promise<GeofabrikFeature[]> {
    if (this.catalog) return this.catalog;
    if (!(await exists(PATHS.geofabrikIndex))) {
      report(`${c.cyan("→")} downloading region catalog ${c.dim("(geofabrik index)")}`);
      await download(UPSTREAM.geofabrikIndex, PATHS.geofabrikIndex, { label: "catalog" });
    }
    const raw = await fs.readFile(PATHS.geofabrikIndex, "utf8");
    const parsed = JSON.parse(raw) as { features: GeofabrikFeature[] };
    this.catalog = parsed.features;
    return this.catalog;
  }

  /**
   * Resolves a plain place name to candidate regions: the curated catalog first
   * (exact borders, no network), then Nominatim for anything it does not cover.
   */
  async resolve(query: string): Promise<Place[]> {
    const catalog = await this.ensureCatalog();
    const hits = this.searchCatalog(query, catalog);
    if (hits.length > 0 && hits[0]) return hits;

    log(`${c.dim("not in catalog, searching OpenStreetMap…")}`);
    return this.searchNominatim(query);
  }

  /**
   * Same lookup, but the full boundaries stay here and the browser gets back
   * ids plus a coarse preview outline. Downloads then reference the id, so a
   * client can never hand us a polygon of its own choosing.
   */
  async search(query: string): Promise<PlaceCandidate[]> {
    const places = await this.resolve(query);
    return places.map((place) => {
      const id = randomUUID();
      this.candidates.set(id, { place, expiresAt: Date.now() + CANDIDATE_TTL_MS });
      return {
        id,
        name: place.name,
        label: place.label,
        detail: place.detail,
        source: place.source,
        bbox: place.bbox,
        span: bboxSpan(place.bbox),
        preview: simplifyPolygon(place.polygon, PREVIEW_TOLERANCE),
      };
    });
  }

  /** Looks a cached candidate back up by the id handed out by `search()`. */
  candidate(id: string): Place | undefined {
    this.pruneCandidates();
    return this.candidates.get(id)?.place;
  }

  private pruneCandidates(): void {
    const now = Date.now();
    for (const [id, entry] of this.candidates) {
      if (entry.expiresAt < now) this.candidates.delete(id);
    }
    // Hard cap, oldest first, in case someone types a lot without downloading.
    const overflow = this.candidates.size - MAX_CANDIDATES;
    if (overflow > 0) {
      for (const id of [...this.candidates.keys()].slice(0, overflow)) {
        this.candidates.delete(id);
      }
    }
  }

  private searchCatalog(query: string, catalog: GeofabrikFeature[]): Place[] {
    const q = slugify(query);
    const scored: { place: Place; score: number }[] = [];

    for (const f of catalog) {
      const id = f.properties.id;
      const keys = new Set([slugify(id), slugify(id.split("/").pop()!), slugify(f.properties.name)]);

      let score = 0;
      if (keys.has(q)) score = 100;
      else if ([...keys].some((k) => k.startsWith(q))) score = 60;
      else if ([...keys].some((k) => k.includes(q))) score = 30;
      if (score === 0) continue;

      // Prefer bigger administrative units: countries over their sub-regions.
      if (!f.properties.parent) score += 6;
      else if (!f.properties.parent.includes("/")) score += 3;

      scored.push({
        place: {
          name: slugify(id.split("/").pop()!),
          label: labelFor(f),
          detail: f.properties.parent
            ? titleCase(f.properties.parent.split("/").pop()!)
            : "catalog",
          source: "geofabrik",
          bbox: bboxOf(f.geometry),
          polygon: f.geometry,
        },
        score,
      });
    }

    return scored
      .sort((a, b) => b.score - a.score || a.place.label.length - b.place.label.length)
      .slice(0, 6)
      .map((s) => s.place);
  }

  private async searchNominatim(query: string): Promise<Place[]> {
    const url = new URL(UPSTREAM.nominatim);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("polygon_geojson", "1");

    const res = await fetch(url, { headers: { "User-Agent": UPSTREAM.userAgent } });
    if (!res.ok) throw new Error(`nominatim lookup failed (${res.status})`);
    const results = (await res.json()) as NominatimResult[];

    return results
      .filter((r): r is NominatimResult & { geojson: Polygon } => {
        const t = r.geojson?.type;
        return t === "Polygon" || t === "MultiPolygon";
      })
      .map((r) => {
        const [south, north, west, east] = r.boundingbox.map(Number) as [
          number,
          number,
          number,
          number,
        ];
        const parts = r.display_name.split(",").map((s) => s.trim());
        return {
          name: slugify(r.name ?? parts[0] ?? query),
          label: parts[0] ?? query,
          detail: [parts.slice(1).join(", "), r.addresstype ?? r.type].filter(Boolean).join(" · "),
          source: "nominatim" as const,
          bbox: [west, south, east, north] as Bbox,
          polygon: r.geojson,
        };
      });
  }
}
