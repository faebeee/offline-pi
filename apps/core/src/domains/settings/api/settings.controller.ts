import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from '../application/settings.service';
import { SettingsOverview, SettingsSizes } from '../domain/settings.dto';

/**
 * Domain "settings": outpost's configuration, read only. .env is written by
 * ./install.sh alone; this shows what it holds and where the data lives.
 */
@ApiTags('settings')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Every .env variable with its documentation, and every data directory with its drive. */
  @Get()
  overview(): Promise<SettingsOverview> {
    return this.settings.overview();
  }

  /** Disk usage of every data directory (measured on request, kept for 5 minutes). */
  @Get('sizes')
  sizes(): Promise<SettingsSizes> {
    return this.settings.sizes();
  }
}
