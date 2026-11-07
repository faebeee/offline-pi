import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { CollectorService } from './collector.service';
import { HistoryService } from './history.service';

@Controller('api')
export class MetricsController {
  constructor(
    private readonly collector: CollectorService,
    private readonly history: HistoryService,
  ) {}

  /** Cheap liveness check for the container healthcheck. */
  @Get('status')
  status() {
    const latest = this.collector.latest;
    if (!latest || Date.now() - latest.ts > this.collector.intervalMs * 5) {
      throw new ServiceUnavailableException('no recent sample');
    }
    return { ok: true, ts: latest.ts };
  }

  /** Latest snapshot as plain JSON (for scripts / curl). */
  @Get('snapshot')
  snapshot() {
    return this.collector.latest;
  }

  @Get('history')
  getHistory() {
    return { minutes: this.history.minutes, events: this.history.events };
  }
}
