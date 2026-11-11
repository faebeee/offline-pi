import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { SystemModule } from '../system/system.module';
import { DiagnosticsController } from './api/diagnostics.controller';
import { DiagnosticsService } from './application/diagnostics.service';

/**
 * Domain "diagnostics": troubleshooting checks across modules, storage
 * (folder permissions, free space, the USB drive) and the host. Read only.
 */
@Module({
  imports: [SettingsModule, SystemModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
