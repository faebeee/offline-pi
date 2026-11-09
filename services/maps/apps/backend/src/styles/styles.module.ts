import { Module } from "@nestjs/common";
import { RegionsModule } from "../regions/regions.module.ts";
import { StyleService } from "./style.service.ts";
import { StylesController } from "./styles.controller.ts";

@Module({
  imports: [RegionsModule],
  controllers: [StylesController],
  providers: [StyleService],
})
export class StylesModule {}
