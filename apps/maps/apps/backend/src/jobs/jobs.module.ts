import { Module } from "@nestjs/common";
import { RegionsModule } from "../regions/regions.module.ts";
import { JobsController } from "./jobs.controller.ts";
import { JobsService } from "./jobs.service.ts";

@Module({
  imports: [RegionsModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
