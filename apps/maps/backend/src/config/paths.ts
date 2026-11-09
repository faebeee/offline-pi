import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Module root (apps/maps), three levels up from this file. The depth is the
 * same whether we run from `backend/src/config` or the compiled
 * `backend/dist/config`.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../..");

export const PATHS = {
  root: ROOT,
  bin: path.join(ROOT, "bin"),
  pmtilesBin: path.join(ROOT, "bin", process.platform === "win32" ? "pmtiles.exe" : "pmtiles"),
  data: path.join(ROOT, "data"),
  regionsDir: path.join(ROOT, "data", "regions"),
  registry: path.join(ROOT, "data", "regions.json"),
  /** sqlite file holding user data (points of interest) */
  db: path.join(ROOT, "data", "offline-maps.db"),
  geofabrikIndex: path.join(ROOT, "data", "geofabrik-index.json"),
  assets: path.join(ROOT, "assets"),
  fonts: path.join(ROOT, "assets", "fonts"),
  sprites: path.join(ROOT, "assets", "sprites"),
  tmp: path.join(ROOT, ".tmp"),
} as const;
