import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ModulesService } from './modules.service';
import { PodmanService } from './podman.service';

/**
 * /api/modules: the home page's tiles/switches and the System module's
 * controls read from here (public/modules.js). The socket gives full
 * control over the user's Podman, so this only ever starts/stops a module
 * container, and requires the X-Pi-Monitor header so another open tab can't
 * trigger it by accident (CSRF-ish), plus an optional CONTROL_PIN.
 */
@Controller('api/modules')
export class ModulesController {
  constructor(
    private readonly modules: ModulesService,
    private readonly podman: PodmanService,
  ) {}

  @Get()
  list() {
    return {
      control: this.podman.unavailableReason === null,
      controlError: this.podman.unavailableReason,
      pinRequired: !!process.env.CONTROL_PIN,
      modules: this.modules.list(),
    };
  }

  @Post(':id/:action')
  async act(
    @Param('id') id: string,
    @Param('action') action: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('x-control-pin') pin: string | undefined,
    @Body() _body: unknown,
  ) {
    if (piMonitor !== '1') throw new BadRequestException('missing X-Pi-Monitor header');
    if (action !== 'start' && action !== 'stop') throw new NotFoundException(`unknown action "${action}"`);

    const required = process.env.CONTROL_PIN;
    if (required && pin !== required) throw new ForbiddenException('wrong or missing Control PIN');

    if (!this.modules.modules.some((m) => m.id === id)) throw new NotFoundException(`unknown module "${id}"`);

    const module = action === 'start' ? await this.modules.start(id) : await this.modules.stop(id);
    return { module };
  }
}
