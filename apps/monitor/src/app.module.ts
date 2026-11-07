import { Module } from '@nestjs/common';
import { CollectorService } from './metrics/collector.service';
import { HistoryService } from './metrics/history.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsGateway } from './metrics/metrics.gateway';

@Module({
  controllers: [MetricsController],
  providers: [CollectorService, HistoryService, MetricsGateway],
})
export class AppModule {}
