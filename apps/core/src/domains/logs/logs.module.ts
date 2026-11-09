import { Module } from '@nestjs/common';
import { LogsController } from './api/logs.controller';
import { LogsService } from './application/logs.service';
import { ContainerLogsClient } from './infrastructure/container-logs.client';
import { LogsEvents } from './logs.events';

/** Domain "logs": core's own log lines (Nest logger) and the module containers' (podman logs). */
@Module({
  controllers: [LogsController],
  providers: [LogsService, ContainerLogsClient, LogsEvents],
})
export class LogsModule {}
