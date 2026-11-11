import { Module } from '@nestjs/common';
import { SettingsController } from './api/settings.controller';
import { SettingsService } from './application/settings.service';

/** Domain "settings": .env, its documentation and the data directories, read only. */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
