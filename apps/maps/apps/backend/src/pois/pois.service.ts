import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  POI_EMOJI_MAX,
  POI_NAME_MAX,
  type Bbox,
  type CreatePoiRequest,
  type Poi,
  type UpdatePoiRequest,
} from "@offline-maps/shared";
import { Between, Repository } from "typeorm";
import { PoiEntity } from "../db/entities/poi.entity.ts";

/** CRUD over the `pois` table. POIs are global — they are not tied to a region. */
@Injectable()
export class PoisService {
  constructor(
    @InjectRepository(PoiEntity)
    private readonly repo: Repository<PoiEntity>,
  ) {}

  async list(bbox?: Bbox): Promise<Poi[]> {
    const rows = await this.repo.find({
      where: bbox
        ? { lat: Between(bbox[1], bbox[3]), lon: Between(bbox[0], bbox[2]) }
        : undefined,
      // sqlite timestamps are second-resolution, so break ties on the id to
      // keep the order stable between calls.
      order: { createdAt: "ASC", id: "ASC" },
    });
    return rows.map(toPoi);
  }

  async get(id: string): Promise<Poi> {
    return toPoi(await this.find(id));
  }

  async create(body: CreatePoiRequest): Promise<Poi> {
    const entity = this.repo.create({
      id: randomUUID(),
      name: parseName(body?.name),
      emoji: parseEmoji(body?.emoji),
      lat: parseCoord(body?.lat, "lat", 90),
      lon: parseCoord(body?.lon, "lon", 180),
    });
    return toPoi(await this.repo.save(entity));
  }

  /** Partial update: only the keys actually present in the body are touched. */
  async update(id: string, body: UpdatePoiRequest): Promise<Poi> {
    const entity = await this.find(id);
    const patch = body ?? {};

    if (patch.name !== undefined) entity.name = parseName(patch.name);
    if (patch.emoji !== undefined) entity.emoji = parseEmoji(patch.emoji);
    if (patch.lat !== undefined) entity.lat = parseCoord(patch.lat, "lat", 90);
    if (patch.lon !== undefined) entity.lon = parseCoord(patch.lon, "lon", 180);

    return toPoi(await this.repo.save(entity));
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete({ id });
    if (!result.affected) throw new NotFoundException(`no poi with id "${id}"`);
  }

  private async find(id: string): Promise<PoiEntity> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new NotFoundException(`no poi with id "${id}"`);
    return entity;
  }
}

/** Entity -> wire shape. Dates cross the wire as ISO strings. */
function toPoi(entity: PoiEntity): Poi {
  return {
    id: entity.id,
    name: entity.name,
    emoji: entity.emoji,
    lat: entity.lat,
    lon: entity.lon,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function parseName(value: unknown): string {
  if (typeof value !== "string") throw new BadRequestException("name is required");
  const name = value.trim();
  if (!name) throw new BadRequestException("name is required");
  if (name.length > POI_NAME_MAX) {
    throw new BadRequestException(`name must be at most ${POI_NAME_MAX} characters`);
  }
  return name;
}

function parseEmoji(value: unknown): string {
  if (typeof value !== "string") throw new BadRequestException("emoji is required");
  const emoji = value.trim();
  if (!emoji) throw new BadRequestException("emoji is required");
  if (emoji.length > POI_EMOJI_MAX) throw new BadRequestException("emoji must be a single symbol");
  return emoji;
}

function parseCoord(value: unknown, field: "lat" | "lon", limit: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new BadRequestException(`${field} must be a number`);
  }
  if (n < -limit || n > limit) {
    throw new BadRequestException(`${field} must be between -${limit} and ${limit}`);
  }
  return n;
}

/** Parses a `minLon,minLat,maxLon,maxLat` query string. */
export function parseBbox(value: string): Bbox {
  const parts = value.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new BadRequestException("bbox must be minLon,minLat,maxLon,maxLat");
  }
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  if (minLon > maxLon || minLat > maxLat) throw new BadRequestException("bbox is inverted");
  return [minLon, minLat, maxLon, maxLat];
}
