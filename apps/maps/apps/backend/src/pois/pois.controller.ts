import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type {
  CreatePoiRequest,
  Poi,
  PoisResponse,
  UpdatePoiRequest,
} from "@offline-maps/shared";
import { parseBbox, PoisService } from "./pois.service.ts";

@Controller("api/pois")
export class PoisController {
  constructor(private readonly pois: PoisService) {}

  /** All points of interest, optionally limited to a `minLon,minLat,maxLon,maxLat` box. */
  @Get()
  async list(@Query("bbox") bbox?: string): Promise<PoisResponse> {
    const box = bbox?.trim() ? parseBbox(bbox) : undefined;
    return { pois: await this.pois.list(box) };
  }

  @Post()
  @HttpCode(201)
  create(@Body() body: CreatePoiRequest): Promise<Poi> {
    return this.pois.create(body ?? ({} as CreatePoiRequest));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdatePoiRequest): Promise<Poi> {
    return this.pois.update(id, body ?? {});
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string): Promise<void> {
    return this.pois.remove(id);
  }
}
