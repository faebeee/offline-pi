import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MeshMapService } from '../application/mesh-map.service';
import { MeshMapOverview } from '../domain/mesh-map.dto';

/** Domain "mesh-map": the Meshtastic nodes on the offline maps. */
@ApiTags('mesh-map')
@Controller('api/mesh-map')
export class MeshMapController {
  constructor(private readonly meshMap: MeshMapService) {}

  /** Regions to draw, map assets and every node with a position. */
  @Get('overview')
  overview(): Promise<MeshMapOverview> {
    return this.meshMap.overview();
  }
}
