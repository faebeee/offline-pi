import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DiagnosticsService } from '../application/diagnostics.service';
import { DiagnosticsReport } from '../domain/diagnostics.dto';

/** Domain "diagnostics": what works and what doesn't, with a fix for each problem. */
@ApiTags('diagnostics')
@Controller('api/diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  /** Runs every check (setup, modules, storage, host); takes a few seconds. */
  @Get()
  run(): Promise<DiagnosticsReport> {
    return this.diagnostics.run();
  }
}
