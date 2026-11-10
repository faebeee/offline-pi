import { Module } from '@nestjs/common';
import { InfoController } from './api/info.controller';
import { InfoService } from './application/info.service';
import { DocsReader } from './infrastructure/docs.reader';

/** Domain "info": the project documentation (docs/*.md) for the Info screen. */
@Module({
  controllers: [InfoController],
  providers: [InfoService, DocsReader],
})
export class InfoModule {}
