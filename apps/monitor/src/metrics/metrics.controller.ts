import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CollectorService } from './collector.service';
import { ContainerAction, ControlService } from './control.service';
import { HistoryService } from './history.service';
import { RuntimeService } from './runtime.service';

@Controller('api')
export class MetricsController {
  constructor(
    private readonly collector: CollectorService,
    private readonly history: HistoryService,
    private readonly runtime: RuntimeService,
    private readonly control: ControlService,
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

  /**
   * Start or stop one container (= one offline-pi app) by name. Only when
   * CONTAINER_CONTROL=true; never the dashboard's own container. The custom
   * header keeps other web pages from posting here: a cross-origin request
   * with it needs a CORS preflight, which this server never allows.
   */
  @Post('containers/:name/:action')
  @HttpCode(200)
  async containerAction(
    @Param('name') name: string,
    @Param('action') action: string,
    @Headers('x-pi-monitor') marker: string | undefined,
  ) {
    if (marker !== '1') throw new ForbiddenException('missing X-Pi-Monitor header');
    if (action !== 'start' && action !== 'stop') throw new BadRequestException('action must be start or stop');
    const reason = this.control.unavailableReason;
    if (reason) throw new ForbiddenException(reason);
    const id = this.runtime.fullIds.get(name);
    if (!id) throw new NotFoundException(`no container named ${name}`);
    if (this.control.isSelf(id)) throw new ForbiddenException('the dashboard cannot stop its own container');

    try {
      await this.control.run(id, action as ContainerAction);
    } catch (err) {
      throw new InternalServerErrorException((err as Error).message);
    }
    await this.runtime.refresh();
    return { ok: true, container: this.runtime.containers.list.find((c) => c.name === name) ?? null };
  }
}
