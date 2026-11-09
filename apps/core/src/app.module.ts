import { Module } from '@nestjs/common';
import { CollectorService } from './metrics/collector.service';
import { HistoryService } from './metrics/history.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsGateway } from './metrics/metrics.gateway';
import { RuntimeService } from './metrics/runtime.service';
import { ModulesController } from './modules/modules.controller';
import { ModulesService } from './modules/modules.service';
import { PodmanService } from './modules/podman.service';

@Module({
  controllers: [MetricsController, ModulesController],
  providers: [PodmanService, RuntimeService, CollectorService, HistoryService, MetricsGateway, ModulesService],
})
export class AppModule {}
