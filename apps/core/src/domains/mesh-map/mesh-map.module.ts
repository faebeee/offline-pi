import { Module } from '@nestjs/common';
import { MeshModule } from '../mesh/mesh.module';
import { MeshMapController } from './api/mesh-map.controller';
import { MeshMapService } from './application/mesh-map.service';
import { MeshMapClient } from './infrastructure/mesh-map.client';

/** Domain "mesh-map": nodes from the mesh domain on the mesh-map container's maps. */
@Module({
  imports: [MeshModule],
  controllers: [MeshMapController],
  providers: [MeshMapClient, MeshMapService],
})
export class MeshMapModule {}
