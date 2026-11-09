import { Module } from '@nestjs/common';
import { MeshController } from './api/mesh.controller';
import { MeshFeed } from './application/mesh-feed.service';
import { MeshClient } from './infrastructure/mesh.client';
import { MeshEvents } from './mesh.events';

/** Domain "mesh": Meshtastic messaging, backed by the mesh container. */
@Module({
  controllers: [MeshController],
  providers: [MeshClient, MeshFeed, MeshEvents],
  exports: [MeshClient, MeshFeed],
})
export class MeshModule {}
