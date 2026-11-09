import { Module } from "@nestjs/common";
import { ArchiveService } from "./archive.service.ts";
import { ArchivesController } from "./archives.controller.ts";
import { RegionsController } from "./regions.controller.ts";
import { RegistryService } from "./registry.service.ts";
import { TilesController } from "./tiles.controller.ts";

/** The registry of downloaded regions, and everything served out of it. */
@Module({
  controllers: [RegionsController, TilesController, ArchivesController],
  providers: [RegistryService, ArchiveService],
  exports: [RegistryService, ArchiveService],
})
export class RegionsModule {}
