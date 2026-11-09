import { Module } from '@nestjs/common';
import { ModulesController } from './api/modules.controller';

/** Domain "modules": installed modules, their state, start/stop. */
@Module({ controllers: [ModulesController] })
export class ModulesModule {}
