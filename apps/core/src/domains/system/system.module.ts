import { Module } from '@nestjs/common';
import { SystemController } from './api/system.controller';
import { CollectorService } from './application/collector.service';
import { HistoryService } from './application/history.service';
import { InternetService } from './application/internet.service';
import { UpdateService } from './application/update.service';
import { SystemEvents } from './system.events';

/** Domain "system": the Pi's health, power, storage, network and containers. */
@Module({
  controllers: [SystemController],
  providers: [CollectorService, HistoryService, InternetService, UpdateService, SystemEvents],
  exports: [CollectorService, InternetService, UpdateService],
})
export class SystemModule {}
