import type { MeshNode } from "@outpost/api-client";
import { ago } from "@outpost/ui/outpost.js";

export type Positioned = MeshNode & { latitude: number; longitude: number };
export type Age = "fresh" | "old" | "stale";

export const hasPosition = (n: MeshNode): n is Positioned => n.latitude != null && n.longitude != null;

export const nodeId = (n: MeshNode) => n.nodeId || `!${(n.num >>> 0).toString(16).padStart(8, "0")}`;
export const nodeName = (n: MeshNode) => n.longName || n.shortName || nodeId(n);
/** Badge text: the short name, else the last 4 hex digits of the id. */
export const nodeBadge = (n: MeshNode) => n.shortName || nodeId(n).slice(-4);

/** fresh: heard within 2 h; old: within a day; stale: longer, or never. */
export function nodeAge(n: MeshNode, now: number): Age {
  if (!n.lastHeard) return "stale";
  const age = now - n.lastHeard;
  return age < 2 * 3600 ? "fresh" : age < 86400 ? "old" : "stale";
}

export const AGE_LED: Record<Age, string> = { fresh: "led-ok", old: "led-cau", stale: "led-off" };
export const AGE_WORD: Record<Age, string> = { fresh: "Fresh", old: "Old", stale: "Stale" };

export const hops = (n: MeshNode) =>
  n.hopsAway == null ? null : n.hopsAway === 0 ? "direct" : `${n.hopsAway} hop${n.hopsAway === 1 ? "" : "s"}`;

/** "HEARD 3 MIN AGO · 2 HOPS" (or "THIS PI · !abcd1234" for the base). */
export function metaLine(n: MeshNode, ownNum: number | null, now: number): string {
  if (n.num === ownNum) return `This Pi · ${nodeId(n)}`;
  return [`Heard ${ago(n.lastHeard, now)}`, hops(n)].filter(Boolean).join(" · ");
}

/** Positioned nodes, own node first, then most recently heard. */
export function positioned(nodes: Map<number, MeshNode>, ownNum: number | null): Positioned[] {
  return [...nodes.values()]
    .filter(hasPosition)
    .sort((a, b) => Number(b.num === ownNum) - Number(a.num === ownNum) || (b.lastHeard ?? 0) - (a.lastHeard ?? 0));
}
