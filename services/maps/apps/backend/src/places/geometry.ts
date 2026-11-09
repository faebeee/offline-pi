import type { Polygon } from "@offline-maps/shared";

type Ring = number[][];

/** Perpendicular distance from p to the segment a–b, in degrees. */
function segmentDistance(p: number[], a: number[], b: number[]): number {
  const [px, py] = p as [number, number];
  const [ax, ay] = a as [number, number];
  const [bx, by] = b as [number, number];
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ramer–Douglas–Peucker, iterative to stay safe on very long rings. */
function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;

  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const dist = segmentDistance(ring[i]!, ring[start]!, ring[end]!);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const out = ring.filter((_, i) => keep[i] === 1);
  // A ring needs at least 4 positions (first == last) to stay valid.
  return out.length >= 4 ? out : ring;
}

/**
 * Shrinks a boundary to something cheap to ship to the browser. The outline is
 * only a visual guide — tile coverage always extends a little past it, because
 * extraction keeps whole tiles that touch the region.
 */
export function simplifyPolygon(polygon: Polygon, tolerance = 0.002): Polygon {
  if (polygon.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: (polygon.coordinates as Ring[]).map((r) => simplifyRing(r, tolerance)),
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: (polygon.coordinates as Ring[][]).map((poly) =>
      poly.map((r) => simplifyRing(r, tolerance)),
    ),
  };
}
