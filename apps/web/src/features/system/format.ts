import type { StatusState } from "@offline-pi/ui/outpost.js";

// ------------------------------------------------------------ formatting
export function fmtBytes(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export const fmtRate = (n: number | null | undefined) => (n == null ? "--" : `${fmtBytes(n)}/s`);

export const fmtNum = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? "--" : n.toFixed(d));

export function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}D ${h}H ${m}M` : h ? `${h}H ${m}M` : `${m}M`;
}

export const unitFmt = (unit: string, d: number) => (v: number | null | undefined) =>
  v == null ? "--" : `${fmtNum(v, d)} ${unit}`;

// ------------------------------------------------------------ thresholds
export type Level = "good" | "warning" | "serious" | "critical";

function levelFor(
  v: number | null | undefined,
  warn: number,
  serious: number,
  crit: number,
  lowerIsWorse = false,
): Level | null {
  if (v == null) return null;
  const worse = (a: number, b: number) => (lowerIsWorse ? a <= b : a >= b);
  if (worse(v, crit)) return "critical";
  if (worse(v, serious)) return "serious";
  if (worse(v, warn)) return "warning";
  return "good";
}

export const SEV_LABEL: Record<Level, string> = { good: "Normal", warning: "Elevated", serious: "High", critical: "Critical" };
export const SEV_RANK: Record<Level, number> = { good: 0, warning: 1, serious: 2, critical: 3 };
/** Outpost status per severity: ok / cau / crit. */
export const TONE: Record<Level, "ok" | "cau" | "crit"> = { good: "ok", warning: "cau", serious: "crit", critical: "crit" };

export const tempLevel = (c: number | null | undefined) => levelFor(c, 70, 80, 85);
export const voltLevel = (v: number | null | undefined) => levelFor(v, 4.85, 4.75, 4.65, true);
export const pctLevel = (p: number | null | undefined) => levelFor(p, 80, 90, 95);

/** Progress tone of a percentage (cores, disks). */
export const pctTone = (lvl: Level | null): "cau" | "crit" | undefined =>
  lvl === "warning" ? "cau" : lvl === "serious" || lvl === "critical" ? "crit" : undefined;

export type Tone = Exclude<StatusState, "info">;
