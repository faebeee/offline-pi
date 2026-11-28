import { Module } from '@nestjs/common';
import { BoardModule } from './domains/board/board.module';
import { DiagnosticsModule } from './domains/diagnostics/diagnostics.module';
import { FilesModule } from './domains/files/files.module';
import { InfoModule } from './domains/info/info.module';
import { LibraryModule } from './domains/library/library.module';
import { LogsModule } from './domains/logs/logs.module';
import { MapsModule } from './domains/maps/maps.module';
import { NetworkModule } from './domains/network/network.module';
import { SettingsModule } from './domains/settings/settings.module';
import { ModulesModule } from './domains/modules/modules.module';
import { SuppliesModule } from './domains/supplies/supplies.module';
import { SystemModule } from './domains/system/system.module';
import { UsersModule } from './domains/users/users.module';
import { PlatformModule } from './platform/platform.module';

/**
 * core: the one API of outpost. PlatformModule is the shared kernel
 * (module registry, podman, upstream clients); every feature is a domain
 * module under src/domains/<name>/ with its own /api/<name>/ routes. A new
 * feature = a new domain module listed here (see AGENTS.md).
 */
@Module({
  imports: [PlatformModule, UsersModule, ModulesModule, SystemModule, MapsModule, NetworkModule, FilesModule, BoardModule, SuppliesModule, LibraryModule, LogsModule, InfoModule, SettingsModule, DiagnosticsModule],
})
export class AppModule {}
