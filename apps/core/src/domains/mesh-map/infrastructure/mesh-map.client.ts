import { Injectable } from '@nestjs/common';
import { UpstreamService } from '../../../platform/upstream/upstream.service';

export interface RawRegion {
  name: string;
  label: string;
  bbox: number[];
  minzoom: number;
  maxzoom: number;
}

/** The mesh-map container (apps/mesh-map/server.mjs): region list and map assets. */
@Injectable()
export class MeshMapClient {
  constructor(private readonly upstream: UpstreamService) {}

  async regions(): Promise<RawRegion[]> {
    const res = await this.upstream.client('mesh-map').get<{ regions: RawRegion[] }>('/api/config');
    return res.regions ?? [];
  }

  /** Public passthrough root of the container's files, e.g. /svc/mesh-map. */
  publicRoot(): string {
    return this.upstream.client('mesh-map').module.svcPath.slice(0, -1);
  }
}
