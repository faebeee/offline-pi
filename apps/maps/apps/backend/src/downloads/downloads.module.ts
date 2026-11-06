import { Module } from "@nestjs/common";
import { JobsModule } from "../jobs/jobs.module.ts";
import { PlacesModule } from "../places/places.module.ts";
import { RegionsModule } from "../regions/regions.module.ts";
import { ToolsModule } from "../tools/tools.module.ts";
import { DownloadService } from "./download.service.ts";
import { DownloadsController } from "./downloads.controller.ts";

@Module({
  imports: [JobsModule, PlacesModule, RegionsModule, ToolsModule],
  controllers: [DownloadsController],
  providers: [DownloadService],
})
export class DownloadsModule {}
