import { Controller, Get, Headers, HttpCode, Post, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CollectorService } from '../application/collector.service';
import { HistoryService } from '../application/history.service';
import { UpdateService } from '../application/update.service';
import { History, Liveness, Snapshot, Vitals } from '../domain/snapshot.dto';
import { UpdateStatus } from '../domain/update.dto';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { assertControl } from '../../../platform/http/control-guard';

/**
 * The Pi itself: health, power, storage, network, containers. Live updates:
 * socket namespace /system. Admins only (authMiddleware), except the
 * liveness check (public) and the vitals of the status strip (every account).
 */
@ApiTags('system')
@Controller('api/system')
export class SystemController {
  constructor(
    private readonly collector: CollectorService,
    private readonly historyService: HistoryService,
    private readonly updates: UpdateService,
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

  /** The status strip's values (null right after start). */
  @Get('vitals')
  @ApiOkResponse({ type: Vitals })
  vitals(): Vitals | null {
    const s = this.collector.latest;
    if (!s) return null;
    const root = s.disks.find((d) => d.mount === '/') ?? s.disks[0];
    const m = s.memory;
    return {
      internet: s.internet?.state ?? 'disabled',
      cpuTemp: s.temps.cpu,
      inputVolts: s.power.inputVolts,
      coreVolts: s.power.coreVolts,
      underVoltage: !!(s.power.underVoltageNow ?? s.throttle?.now.underVoltage ?? false),
      cpuUsage: s.cpu.usage,
      memoryPercent: m && m.total > 0 ? ((m.total - m.available) / m.total) * 100 : null,
      disk: root && root.total > 0 ? { used: root.used, free: root.free, total: root.total } : null,
    };
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

  /** Whether a newer release of outpost exists (the last check's answer; live: socket event "update"). */
  @Get('update')
  update(): UpdateStatus {
    return this.updates.status();
  }

  /** Ask GitHub now instead of waiting for the daily check (admins, at most once a minute). */
  @Post('update/check')
  @HttpCode(200)
  async checkUpdate(
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<UpdateStatus> {
    assertControl(piMonitor, user);
    return this.updates.checkNow();
  }
}
