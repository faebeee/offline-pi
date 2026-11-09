import { Module } from "@nestjs/common";
import { SpaController } from "./spa.controller.ts";

@Module({ controllers: [SpaController] })
export class SpaModule {}
