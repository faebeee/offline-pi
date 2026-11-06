import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.ts";
import { JobsModule } from "../jobs/jobs.module.ts";
import { PlacesModule } from "../places/places.module.ts";
import { RegionsModule } from "../regions/regions.module.ts";
import { ToolsModule } from "../tools/tools.module.ts";
import { SetupController } from "./setup.controller.ts";

@Module({
  imports: [ToolsModule, AssetsModule, PlacesModule, RegionsModule, JobsModule],
  controllers: [SetupController],
})
export class SetupModule {}
