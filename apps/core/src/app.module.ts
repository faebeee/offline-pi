import { Module } from '@nestjs/common';
import { LibraryModule } from './domains/library/library.module';
import { LogsModule } from './domains/logs/logs.module';
import { MapsModule } from './domains/maps/maps.module';
import { MeshMapModule } from './domains/mesh-map/mesh-map.module';
import { MeshModule } from './domains/mesh/mesh.module';
import { ModulesModule } from './domains/modules/modules.module';
import { SystemModule } from './domains/system/system.module';
import { PlatformModule } from './platform/platform.module';

/**
 * core: the one API of offline-pi. PlatformModule is the shared kernel
 * (module registry, podman, upstream clients); every feature is a domain
 * module under src/domains/<name>/ with its own /api/<name>/ routes. A new
 * feature = a new domain module listed here (see AGENTS.md).
 */
@Module({
  imports: [PlatformModule, ModulesModule, SystemModule, MapsModule, MeshModule, MeshMapModule, LibraryModule, LogsModule],
})
export class AppModule {}
