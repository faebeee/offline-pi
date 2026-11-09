import { Module } from "@nestjs/common";
import { PlanetBuildService } from "./build.service.ts";
import { PlacesController } from "./places.controller.ts";
import { PlacesService } from "./places.service.ts";

/** Name -> boundary lookup and planet build resolution. */
@Module({
  controllers: [PlacesController],
  providers: [PlacesService, PlanetBuildService],
  exports: [PlacesService, PlanetBuildService],
})
export class PlacesModule {}
