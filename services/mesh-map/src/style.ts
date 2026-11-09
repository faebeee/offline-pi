import { layers, namedFlavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

/** The basemap follows the Outpost UI theme: dark map in .t-dark, light in .t-light. */
export type Theme = "dark" | "light";

export type Bbox = [west: number, south: number, east: number, north: number];

/** A region the Maps module has downloaded (subset of its regions.json). */
export type Region = {
  name: string;
  label: string;
  bbox: Bbox;
  minzoom: number;
  maxzoom: number;
};

const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * One style rendering every region: a pmtiles source per region, each with the
 * full basemap layer stack. The stacks are interleaved by index (same as
 * the Maps module) so one region's land/water fills never paint over another's
 * roads and labels where they overlap. Every URL points back at this server.
 * `ground` (the UI's --map token) replaces the flavor's background and land
 * colour, so the map sits flush with the frame in both themes.
 */
export function buildStyle(regions: Region[], theme: Theme, origin: string, ground?: string): StyleSpecification {
  const base = namedFlavor(theme);
  const flavor = ground ? { ...base, background: ground, earth: ground } : base;
  const sources: StyleSpecification["sources"] = {};
  for (const r of regions) {
    sources[`pm-${r.name}`] = {
      type: "vector",
      url: `pmtiles://${origin}/pmtiles/${r.name}.pmtiles`,
      attribution: ATTRIBUTION,
    };
  }

  const stacks = regions.map((r) =>
    layers(`pm-${r.name}`, flavor, { lang: "en" }).filter((l) => l.id !== "background"),
  );
  const depth = Math.max(0, ...stacks.map((s) => s.length));
  const interleaved = [];
  for (let i = 0; i < depth; i += 1) {
    for (const [index, stack] of stacks.entries()) {
      const layer = stack[i];
      const region = regions[index];
      if (layer && region) interleaved.push({ ...layer, id: `${region.name}:${layer.id}` });
    }
  }

  return {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/sprites/${theme}`,
    sources,
    layers: [
      { id: "background", type: "background", paint: { "background-color": flavor.background } },
      ...(interleaved as StyleSpecification["layers"]),
    ],
  };
}

/** Smallest box containing every region. */
export function unionBbox(regions: Region[]): Bbox | undefined {
  if (!regions.length) return undefined;
  return regions.reduce<Bbox>(
    (acc, r) => [
      Math.min(acc[0], r.bbox[0]),
      Math.min(acc[1], r.bbox[1]),
      Math.max(acc[2], r.bbox[2]),
      Math.max(acc[3], r.bbox[3]),
    ],
    [180, 90, -180, -90],
  );
}
