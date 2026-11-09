import { Module } from '@nestjs/common';
import { ControlService } from './metrics/control.service';
import { CollectorService } from './metrics/collector.service';
import { HistoryService } from './metrics/history.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsGateway } from './metrics/metrics.gateway';
import { RuntimeService } from './metrics/runtime.service';

@Module({
  controllers: [MetricsController],
  providers: [ControlService, RuntimeService, CollectorService, HistoryService, MetricsGateway],
})
export class AppModule {}
