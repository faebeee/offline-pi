import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiTags } from '@nestjs/swagger';
import { ModuleActionResult, ModulesOverview } from '../../../platform/modules/module-status.dto';
import { ModulesService } from '../../../platform/modules/modules.service';
import { PodmanService } from '../../../platform/modules/podman.service';

/**
 * Domain "modules": which modules are installed, switched on and running
 * (home page tiles and switches, the nav), and starting/stopping them. The
 * socket gives full control over the user's Podman, so this only ever
 * starts/stops a module container, and requires the X-Pi-Monitor header so
 * another site can't trigger it with a simple form post (CSRF), plus an
 * optional CONTROL_PIN.
 */
@ApiTags('modules')
@Controller('api/modules')
export class ModulesController {
  constructor(
    private readonly modules: ModulesService,
    private readonly podman: PodmanService,
  ) {}

  @Get()
  list(): ModulesOverview {
    return {
      control: this.podman.unavailableReason === null,
      controlError: this.podman.unavailableReason,
      pinRequired: !!process.env.CONTROL_PIN,
      modules: this.modules.list(),
    };
  }

  /** Start or stop a module container; the choice survives reboots. */
  @Post(':id/:action')
  @HttpCode(200)
  @ApiParam({ name: 'action', enum: ['start', 'stop'] })
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  @ApiHeader({ name: 'X-Control-Pin', required: false, description: 'CONTROL_PIN, when set' })
  async control(
    @Param('id') id: string,
    @Param('action') action: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('x-control-pin') pin: string | undefined,
  ): Promise<ModuleActionResult> {
    if (piMonitor !== '1') throw new BadRequestException('missing X-Pi-Monitor header');
    if (action !== 'start' && action !== 'stop') throw new NotFoundException(`unknown action "${action}"`);

    const required = process.env.CONTROL_PIN;
    if (required && pin !== required) throw new ForbiddenException('wrong or missing Control PIN');

    if (!this.modules.get(id)) throw new NotFoundException(`unknown module "${id}"`);

    try {
      const module = action === 'start' ? await this.modules.start(id) : await this.modules.stop(id);
      return { module };
    } catch (err) {
      throw new ConflictException((err as Error).message);
    }
  }
}
