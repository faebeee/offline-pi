import { Module } from '@nestjs/common';
import { FilesController } from './api/files.controller';
import { FilesClient } from './infrastructure/files.client';

/** Domain "files": a shared folder on the Pi, backed by the files container. */
@Module({
  controllers: [FilesController],
  providers: [FilesClient],
  exports: [FilesClient],
})
export class FilesModule {}
