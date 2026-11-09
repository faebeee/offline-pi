import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PoiEntity } from "../db/entities/poi.entity.ts";
import { PoisController } from "./pois.controller.ts";
import { PoisService } from "./pois.service.ts";

/** User-placed points of interest. */
@Module({
  imports: [TypeOrmModule.forFeature([PoiEntity])],
  controllers: [PoisController],
  providers: [PoisService],
  exports: [PoisService],
})
export class PoisModule {}
