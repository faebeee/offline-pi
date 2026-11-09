import { Module } from "@nestjs/common";
import { PmtilesService } from "./pmtiles.service.ts";

@Module({ providers: [PmtilesService], exports: [PmtilesService] })
export class ToolsModule {}
