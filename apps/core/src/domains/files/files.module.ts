import { Module } from '@nestjs/common';
import { FilesController } from './api/files.controller';
import { SharedFolder } from './infrastructure/shared-folder';

/** Domain "files": a shared folder on the Pi, kept by core (FILES_DATA_DIR). */
@Module({
  controllers: [FilesController],
  providers: [SharedFolder],
  exports: [SharedFolder],
})
export class FilesModule {}
