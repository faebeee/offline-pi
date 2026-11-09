import { Injectable } from '@nestjs/common';
import type * as Shared from '@offline-pi/maps-shared';
import { UpstreamClient, UpstreamService } from '../../../platform/upstream/upstream.service';
import { readSse } from '../../../platform/upstream/sse';
import type {
  CreateDownloadRequest,
  CreatePoiRequest,
  Job,
  JobsResponse,
  MapsStatus,
  PlacesResponse,
  Poi,
  PoisResponse,
  RegionsResponse,
  UpdatePoiRequest,
} from '../domain/maps.dto';

// Compile-time check: the container's types (maps-shared) fit the domain DTOs.
type Fits<Upstream, Domain> = Upstream extends Domain ? true : never;
const _fits: [
  Fits<Shared.Status, MapsStatus>,
  Fits<Shared.RegionsResponse, RegionsResponse>,
  Fits<Shared.PlacesResponse, PlacesResponse>,
  Fits<Shared.Job, Job>,
  Fits<Shared.JobsResponse, JobsResponse>,
  Fits<Shared.Poi, Poi>,
  Fits<Shared.PoisResponse, PoisResponse>,
] = [true, true, true, true, true, true, true];
void _fits;

/** The maps container's HTTP API (apps/maps/backend), on loopback. */
@Injectable()
export class MapsClient {
  constructor(private readonly upstream: UpstreamService) {}

  private get c(): UpstreamClient {
    return this.upstream.client('maps');
  }

  status() {
    return this.c.get<MapsStatus>('/api/status');
  }
  setup() {
    return this.c.post<Job>('/api/setup');
  }
  regions() {
    return this.c.get<RegionsResponse>('/api/regions');
  }
  deleteRegion(name: string) {
    return this.c.delete<void>(`/api/regions/${encodeURIComponent(name)}`);
  }
  places(q: string) {
    return this.c.get<PlacesResponse>('/api/places', { query: { q }, timeoutMs: 30_000 });
  }
  createDownload(body: CreateDownloadRequest) {
    return this.c.post<Job>('/api/downloads', body, { timeoutMs: 60_000 });
  }
  confirmDownload(id: string) {
    return this.c.post<Job>(`/api/downloads/${encodeURIComponent(id)}/confirm`);
  }
  jobs() {
    return this.c.get<JobsResponse>('/api/jobs');
  }
  job(id: string) {
    return this.c.get<Job>(`/api/jobs/${encodeURIComponent(id)}`);
  }
  cancelJob(id: string) {
    return this.c.delete<Job>(`/api/jobs/${encodeURIComponent(id)}`);
  }
  pois(bbox?: string) {
    return this.c.get<PoisResponse>('/api/pois', { query: { bbox } });
  }
  createPoi(body: CreatePoiRequest) {
    return this.c.post<Poi>('/api/pois', body);
  }
  updatePoi(id: string, body: UpdatePoiRequest) {
    return this.c.patch<Poi>(`/api/pois/${encodeURIComponent(id)}`, body);
  }
  deletePoi(id: string) {
    return this.c.delete<void>(`/api/pois/${encodeURIComponent(id)}`);
  }

  /**
   * A MapLibre style. Its tile, font and sprite URLs are absolute and built
   * by the container from the forwarded host and prefix, so they point at
   * core's passthrough (/svc/maps/...).
   */
  style(name: string, theme: string, host: string | undefined) {
    const c = this.c;
    return c.get<Record<string, unknown>>(`/api/styles/${encodeURIComponent(name)}.json`, {
      query: { theme },
      headers: c.forwarded(host),
    });
  }

  /** Live updates of one job until it settles (the container's SSE stream). */
  async *watchJob(id: string, signal: AbortSignal): AsyncGenerator<Job> {
    const res = await this.c.fetch('GET', `/api/jobs/${encodeURIComponent(id)}/events`, {
      headers: { accept: 'text/event-stream' },
      signal,
      timeoutMs: 24 * 60 * 60_000,
    });
    for await (const ev of readSse(res)) yield JSON.parse(ev.data) as Job;
  }
}
