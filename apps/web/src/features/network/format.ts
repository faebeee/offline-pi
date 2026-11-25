import type { HotspotClient } from "@outpost/api-client";

/** "-48 dBm · strong" */
export function signalText(dbm: number | null | undefined): string | null {
  if (dbm == null) return null;
  const word = dbm >= -55 ? "strong" : dbm >= -70 ? "good" : dbm >= -80 ? "weak" : "very weak";
  return `${dbm} dBm · ${word}`;
}

/** 3725 -> "1 h 2 min"; 0/null -> "" */
export function duration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min`;
  return `${seconds} s`;
}

/** The row title: what the device calls itself, else its vendor, else the MAC. */
export function title(c: HotspotClient): string {
  return c.hostname || c.vendor || c.mac;
}

/** Two letters for the monogram: hostname or vendor initials, else the MAC's end. */
export function monogram(c: HotspotClient): string {
  const name = c.hostname || c.vendor;
  if (name) {
    const words = name.replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
    const [a = "", b = ""] = words;
    const letters = b ? a.slice(0, 1) + b.slice(0, 1) : a.slice(0, 2);
    if (letters) return letters.toUpperCase();
  }
  return c.mac.slice(-5).replace(":", "").toUpperCase();
}
