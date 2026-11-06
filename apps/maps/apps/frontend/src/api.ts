import type {
  Bbox,
  CreateDownloadRequest,
  CreatePoiRequest,
  Job,
  JobsResponse,
  PlaceCandidate,
  PlacesResponse,
  Poi,
  PoisResponse,
  Region,
  RegionsResponse,
  Status,
  Theme,
  UpdatePoiRequest,
} from "@offline-maps/shared";

export type {
  Bbox,
  CreatePoiRequest,
  Job,
  PlaceCandidate,
  Poi,
  Polygon,
  Region,
  Status,
  Theme,
  UpdatePoiRequest,
} from "@offline-maps/shared";
export {
  DEFAULT_MAXZOOM,
  DEFAULT_POI_EMOJI,
  isJobFinished,
  isTheme,
  MAX_ZOOM,
  POI_EMOJI_MAX,
  POI_EMOJI_PRESETS,
  POI_NAME_MAX,
  THEMES,
} from "@offline-maps/shared";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBuild(build: string): string {
  if (!/^\d{8}$/.test(build)) return build;
  return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
}

/** Unwraps the backend's error shape so the UI can show the real reason. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      // non-JSON error body; keep the status line
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ------------------------------------------------------------ regions ---

export async function fetchRegions(): Promise<Region[]> {
  const data = await request<RegionsResponse>("/api/regions");
  return data.regions;
}

export function deleteRegion(name: string): Promise<void> {
  return request<void>(`/api/regions/${encodeURIComponent(name)}`, { method: "DELETE" });
}

/** Style that renders every downloaded region at once. */
export function allStyleUrl(theme: Theme): string {
  return `/api/styles/_all.json?theme=${theme}`;
}

/** Smallest box containing every region, for framing the map on first load. */
export function unionBbox(regions: Region[]): Bbox | undefined {
  const [first, ...rest] = regions;
  if (!first) return undefined;
  return rest.reduce<Bbox>(
    (acc, r) => [
      Math.min(acc[0], r.bbox[0]),
      Math.min(acc[1], r.bbox[1]),
      Math.max(acc[2], r.bbox[2]),
      Math.max(acc[3], r.bbox[3]),
    ],
    [...first.bbox],
  );
}

/**
 * Identity of the region set, so effects re-run when a region is added,
 * removed or rebuilt — but not on every refresh that returns the same list.
 */
export function regionsKey(regions: Region[]): string {
  return regions.map((r) => `${r.name}@${r.build}`).join(",");
}

// ------------------------------------------------------------- status ---

export function fetchStatus(): Promise<Status> {
  return request<Status>("/api/status");
}

export function startSetup(): Promise<Job> {
  return request<Job>("/api/setup", { method: "POST" });
}

// ------------------------------------------------------------- places ---

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceCandidate[]> {
  const data = await request<PlacesResponse>(
    `/api/places?q=${encodeURIComponent(query)}`,
    { signal },
  );
  return data.places;
}

// --------------------------------------------------------------- pois ---

export async function fetchPois(bbox?: Bbox): Promise<Poi[]> {
  const query = bbox ? `?bbox=${bbox.join(",")}` : "";
  const data = await request<PoisResponse>(`/api/pois${query}`);
  return data.pois;
}

export function createPoi(body: CreatePoiRequest): Promise<Poi> {
  return request<Poi>("/api/pois", { method: "POST", body: JSON.stringify(body) });
}

export function updatePoi(id: string, body: UpdatePoiRequest): Promise<Poi> {
  return request<Poi>(`/api/pois/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deletePoi(id: string): Promise<void> {
  return request<void>(`/api/pois/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --------------------------------------------------------------- jobs ---

export function startDownload(body: CreateDownloadRequest): Promise<Job> {
  return request<Job>("/api/downloads", { method: "POST", body: JSON.stringify(body) });
}

export function confirmDownload(id: string): Promise<Job> {
  return request<Job>(`/api/downloads/${id}/confirm`, { method: "POST" });
}

export function cancelJob(id: string): Promise<Job> {
  return request<Job>(`/api/jobs/${id}`, { method: "DELETE" });
}

export async function fetchJobs(): Promise<Job[]> {
  const data = await request<JobsResponse>("/api/jobs");
  return data.jobs;
}

/**
 * Server-sent job updates. The stream replays the current state on connect, so
 * a reloaded page picks a running download straight back up.
 */
export function subscribeToJob(id: string, onJob: (job: Job) => void): () => void {
  const source = new EventSource(`/api/jobs/${id}/events`);
  source.onmessage = (event) => onJob(JSON.parse(event.data) as Job);
  // The server completes the stream when the job settles; EventSource reads
  // that as an error and would otherwise reconnect forever.
  source.onerror = () => source.close();
  return () => source.close();
}
