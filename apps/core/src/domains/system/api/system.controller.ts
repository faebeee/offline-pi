import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CollectorService } from '../application/collector.service';
import { HistoryService } from '../application/history.service';
import { History, Liveness, Snapshot } from '../domain/snapshot.dto';

/** The Pi itself: health, power, storage, network, containers. Live updates: socket namespace /system. */
@ApiTags('system')
@Controller('api/system')
export class SystemController {
  constructor(
    private readonly collector: CollectorService,
    private readonly historyService: HistoryService,
  ) {}

  /** Cheap liveness check (container healthcheck): 503 when sampling stalled. */
  @Get('status')
  status(): Liveness {
    const latest = this.collector.latest;
    if (!latest || Date.now() - latest.ts > this.collector.intervalMs * 5) {
      throw new ServiceUnavailableException('no recent sample');
    }
    return { ok: true, ts: latest.ts };
  }

  /** Latest snapshot (null right after start). */
  @Get('snapshot')
  @ApiOkResponse({ type: Snapshot })
  snapshot(): Snapshot | null {
    return this.collector.latest;
  }

  /** One point per minute for 24 h, and the power events. */
  @Get('history')
  history(): History {
    return { minutes: this.historyService.minutes, events: this.historyService.events };
  }
}
