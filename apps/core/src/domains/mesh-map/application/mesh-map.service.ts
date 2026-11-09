import { Injectable } from '@nestjs/common';
import { ModulesService } from '../../../platform/modules/modules.service';
import { MeshClient } from '../../mesh/infrastructure/mesh.client';
import { MeshMapOverview } from '../domain/mesh-map.dto';
import { MeshMapClient } from '../infrastructure/mesh-map.client';

/**
 * Use case "what to draw": the downloaded regions (mesh-map container) and
 * the positioned nodes (mesh domain), in one call. Live node updates come
 * from the /mesh socket namespace.
 */
@Injectable()
export class MeshMapService {
  constructor(
    private readonly maps: MeshMapClient,
    private readonly mesh: MeshClient,
    private readonly modules: ModulesService,
  ) {}

  async overview(): Promise<MeshMapOverview> {
    const root = this.maps.publicRoot();
    const meshRunning = this.modules.isRunning('mesh');
    const [regions, mesh] = await Promise.all([
      this.maps.regions(),
      meshRunning
        ? Promise.all([this.mesh.nodes(), this.mesh.status()]).catch(() => null)
        : Promise.resolve(null),
    ]);
    return {
      regions: regions.map((r) => ({ ...r, pmtilesUrl: `${root}/pmtiles/${r.name}.pmtiles` })),
      assets: { glyphs: `${root}/fonts/{fontstack}/{range}.pbf`, spriteBase: `${root}/sprites/` },
      meshRunning: meshRunning && mesh !== null,
      ownNum: mesh?.[1].nodeNum ?? null,
      nodes: (mesh?.[0] ?? []).filter((n) => n.latitude != null && n.longitude != null),
    };
  }
}
