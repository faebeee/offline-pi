/**
 * The HTTP contract between the backend and the viewer. Both sides import these
 * types so a change to the registry shape breaks the typecheck on both ends.
 */

export type Bbox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

export type Polygon =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export type Region = {
  /** url-safe id, e.g. "switzerland" */
  name: string;
  /** human label, e.g. "Switzerland" */
  label: string;
  source: "geofabrik" | "nominatim";
  bbox: Bbox;
  center: [lon: number, lat: number];
  minzoom: number;
  maxzoom: number;
  /** protomaps build date, YYYYMMDD */
  build: string;
  bytes: number;
  addedAt: string;
  /**
   * Boundary the extract was cut to. Recorded for provenance; the viewer no
   * longer draws it.
   */
  polygon?: Polygon;
};

/** `GET /api/regions` */
export type RegionsResponse = { regions: Region[] };

export const THEMES = ["light", "dark", "white", "grayscale", "black"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export const MAX_ZOOM = 15;
export const DEFAULT_MAXZOOM = 15;

// ------------------------------------------------------------- places ---

/**
 * A candidate boundary returned by `GET /api/places`. The full polygon stays on
 * the server, keyed by `id`; `preview` is a coarse outline for the map.
 */
export type PlaceCandidate = {
  id: string;
  /** suggested region id, e.g. "berlin" */
  name: string;
  label: string;
  /** extra context shown when disambiguating, e.g. "Germany" or the OSM type */
  detail: string;
  source: "geofabrik" | "nominatim";
  bbox: Bbox;
  /** rough degree span, e.g. "0.38° × 0.42°" */
  span: string;
  preview: Polygon;
};

/** `GET /api/places?q=` */
export type PlacesResponse = { places: PlaceCandidate[] };

// --------------------------------------------------------------- jobs ---

export type JobType = "download" | "setup";

export type JobState =
  | "estimating"
  | "awaiting-confirmation"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type DownloadEstimate = {
  archiveBytes: number;
  transferBytes: number;
  build: string;
  /** set when the archive would not comfortably fit on the disk */
  diskWarning?: string;
};

export type JobProgress = {
  bytes: number;
  /** expected total, from the estimate; 0 when unknown */
  total: number;
  percent: number;
};

export type Job = {
  id: string;
  type: JobType;
  state: JobState;
  /** short human label for the current step, e.g. "downloading tiles" */
  stage: string;
  createdAt: string;
  updatedAt: string;
  /** download jobs only */
  region?: { name: string; label: string; minzoom: number; maxzoom: number };
  estimate?: DownloadEstimate;
  progress?: JobProgress;
  error?: string;
  log: string[];
};

export type JobsResponse = { jobs: Job[] };

export function isJobFinished(job: Job): boolean {
  return job.state === "done" || job.state === "failed" || job.state === "cancelled";
}

/** `POST /api/downloads` */
export type CreateDownloadRequest = {
  placeId: string;
  /** override the region id used in URLs and filenames */
  name?: string;
  minzoom?: number;
  maxzoom?: number;
  /** planet build to extract from, YYYYMMDD; omit for the latest */
  build?: string;
  /** replace an existing region of the same name */
  force?: boolean;
};

// --------------------------------------------------------------- pois ---

/**
 * A user-placed point of interest. POIs live in the sqlite database, are global
 * rather than owned by a region, and so survive deleting or re-downloading the
 * region they happen to sit in.
 */
export type Poi = {
  id: string;
  name: string;
  /** a single emoji, rendered as the map marker */
  emoji: string;
  lat: number;
  lon: number;
  createdAt: string;
  updatedAt: string;
};

/** `GET /api/pois` (optionally `?bbox=minLon,minLat,maxLon,maxLat`) */
export type PoisResponse = { pois: Poi[] };

/** `POST /api/pois` */
export type CreatePoiRequest = { name: string; emoji: string; lat: number; lon: number };

/** `PATCH /api/pois/:id` — every field is optional, omitted ones are untouched. */
export type UpdatePoiRequest = Partial<CreatePoiRequest>;

/** Quick-pick palette shown next to the emoji input. */
export const POI_EMOJI_PRESETS = [
  "📍",
  "⭐",
  "🏠",
  "🍽️",
  "☕",
  "🏔️",
  "🏕️",
  "⛽",
  "🚲",
  "🏖️",
  "🅿️",
  "⚓",
] as const;

export const POI_NAME_MAX = 80;
/** UTF-16 units, not characters: one emoji with modifiers can be several units. */
export const POI_EMOJI_MAX = 8;
export const DEFAULT_POI_EMOJI = "📍";

// ------------------------------------------------------------- status ---

/** `GET /api/status` — what the first-run setup still has to do. */
export type Status = {
  pmtiles: { installed: boolean; version?: string };
  assets: { fonts: boolean; sprites: boolean };
  catalog: { ready: boolean; count: number };
  regions: number;
  /** true once tiles can actually be downloaded and rendered */
  ready: boolean;
};
