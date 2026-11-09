import { Module } from '@nestjs/common';
import { MapsController } from './api/maps.controller';
import { JobWatcher } from './application/job-watcher.service';
import { MapsClient } from './infrastructure/maps.client';
import { MapsEvents } from './maps.events';

/** Domain "maps": offline vector maps, backed by the maps container. */
@Module({
  controllers: [MapsController],
  providers: [MapsClient, JobWatcher, MapsEvents],
  exports: [MapsClient],
})
export class MapsModule {}
