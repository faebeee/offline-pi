import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LogsService } from '../application/logs.service';
import { LogPage, LogSources, LogsQuery } from '../domain/logs.dto';

/**
 * Domain "logs": the log lines of core and every installed module, for
 * debugging. Live lines: socket namespace /logs (`follow` a source).
 */
@ApiTags('logs')
@Controller('api/logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  /** core and every installed module, with its container state. */
  @Get('sources')
  sources(): LogSources {
    return this.logs.sources();
  }

  /** The last lines of one source ("core" or a module id), oldest first. */
  @Get(':source')
  entries(@Param('source') source: string, @Query() query: LogsQuery): Promise<LogPage> {
    return this.logs.entries(source, query.tail ?? 500);
  }
}
