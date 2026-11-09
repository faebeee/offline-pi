import { Global, Module } from '@nestjs/common';
import { ModulesService } from './modules/modules.service';
import { PodmanService } from './modules/podman.service';
import { RuntimeService } from './runtime/runtime.service';
import { UpstreamService } from './upstream/upstream.service';

/**
 * The shared kernel every domain builds on: the module registry and their
 * desired/actual state (ModulesService), Podman control, the container and
 * socket sampler (RuntimeService), and UpstreamService, through which a
 * domain talks to its module's container. No feature logic lives here.
 */
@Global()
@Module({
  providers: [PodmanService, RuntimeService, ModulesService, UpstreamService],
  exports: [PodmanService, RuntimeService, ModulesService, UpstreamService],
})
export class PlatformModule {}
