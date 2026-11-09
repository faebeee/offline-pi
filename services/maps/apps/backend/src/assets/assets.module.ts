import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller.ts";
import { AssetsService } from "./assets.service.ts";

@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
