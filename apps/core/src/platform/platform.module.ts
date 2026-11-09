import { Global, Module } from '@nestjs/common';
import { LogBuffer, coreLogBuffer } from './logging/log-buffer';
import { ModulesService } from './modules/modules.service';
import { PodmanService } from './modules/podman.service';
import { RuntimeService } from './runtime/runtime.service';
import { UpstreamService } from './upstream/upstream.service';

/**
 * The shared kernel every domain builds on: the module registry and their
 * desired/actual state (ModulesService), Podman control, the container and
 * socket sampler (RuntimeService), core's own log lines (LogBuffer, filled
 * by CoreLogger), and UpstreamService, through which a
 * domain talks to its module's container. No feature logic lives here.
 */
@Global()
@Module({
  providers: [
    PodmanService,
    RuntimeService,
    ModulesService,
    UpstreamService,
    { provide: LogBuffer, useValue: coreLogBuffer },
  ],
  exports: [PodmanService, RuntimeService, ModulesService, UpstreamService, LogBuffer],
})
export class PlatformModule {}
