import { Module } from '@nestjs/common';
import { SystemController } from './api/system.controller';
import { CollectorService } from './application/collector.service';
import { HistoryService } from './application/history.service';
import { InternetService } from './application/internet.service';
import { SystemEvents } from './system.events';

/** Domain "system": the Pi's health, power, storage, network and containers. */
@Module({
  controllers: [SystemController],
  providers: [CollectorService, HistoryService, InternetService, SystemEvents],
})
export class SystemModule {}
