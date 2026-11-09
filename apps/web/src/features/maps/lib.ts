import { getMapsStyleUrl, type GeoPolygon, type Job, type MapsStyleTheme, type Region } from "@offline-pi/api-client";

/** [minLon, minLat, maxLon, maxLat]; the API types it as number[]. */
export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export const toBbox = (b: number[]): Bbox => [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0];

/** done, failed or cancelled: no more updates will come. */
export function isJobFinished(job: Job): boolean {
  return job.state === "done" || job.state === "failed" || job.state === "cancelled";
}

/** "20250105" as "2025-01-05". */
export function formatBuild(build: string): string {
  if (!/^\d{8}$/.test(build)) return build;
  return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
}

/** Style rendering every downloaded region at once (absolute: MapLibre fetches it). */
export function allStyleUrl(theme: MapsStyleTheme): string {
  return new URL(getMapsStyleUrl("_all", { theme }), location.origin).href;
}

/** A region's archive, for exporting it (core's passthrough to the maps container). */
export function pmtilesUrl(name: string): string {
  return `/svc/maps/pmtiles/${encodeURIComponent(name)}.pmtiles`;
}

/** Smallest box containing every region, for framing the map on first load. */
export function unionBbox(regions: Region[]): Bbox | undefined {
  const [first, ...rest] = regions;
  if (!first) return undefined;
  return rest.reduce<Bbox>(
    (acc, r) => [
      Math.min(acc[0], r.bbox[0] ?? acc[0]),
      Math.min(acc[1], r.bbox[1] ?? acc[1]),
      Math.max(acc[2], r.bbox[2] ?? acc[2]),
      Math.max(acc[3], r.bbox[3] ?? acc[3]),
    ],
    toBbox(first.bbox),
  );
}

/**
 * Identity of the region set, so effects re-run when a region is added,
 * removed or rebuilt, but not on every refresh that returns the same list.
 */
export function regionsKey(regions: Region[]): string {
  return regions.map((r) => `${r.name}@${r.build}`).join(",");
}

/** Bounding box of a preview polygon, for framing the map on it. */
export function polygonBounds(polygon: GeoPolygon): Bbox | undefined {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const child of node) visit(child);
  };
  visit(polygon.coordinates);
  return maxLon > minLon ? [minLon, minLat, maxLon, maxLat] : undefined;
}
