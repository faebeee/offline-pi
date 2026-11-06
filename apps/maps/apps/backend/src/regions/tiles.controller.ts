import { gunzipSync } from "node:zlib";
import { BadRequestException, Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { IMMUTABLE } from "../config/server.ts";
import { ArchiveService } from "./archive.service.ts";

const TILE_EXT = /\.(mvt|pbf|png|jpg|webp|avif)$/;

@Controller("tiles")
export class TilesController {
  constructor(private readonly archives: ArchiveService) {}

  @Get(":region/:z/:x/:file")
  async tile(
    @Param("region") region: string,
    @Param("z") z: string,
    @Param("x") x: string,
    @Param("file") file: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!TILE_EXT.test(file)) throw new NotFoundException("unknown tile format");

    const coords = [Number(z), Number(x), Number(file.replace(TILE_EXT, ""))];
    if (!coords.every(Number.isInteger)) throw new BadRequestException("bad tile coordinates");
    const [tz, tx, ty] = coords as [number, number, number];

    let archive;
    try {
      archive = await this.archives.get(region);
    } catch {
      throw new NotFoundException(`unknown region "${region}"`);
    }

    const tile = await this.archives.readTile(region, tz, tx, ty);
    res.setHeader("Content-Type", archive.contentType);
    res.setHeader("Cache-Control", IMMUTABLE);

    // Empty 204 for absent tiles: MapLibre treats this as "nothing here", not an error.
    if (!tile) {
      res.status(204).end();
      return;
    }

    // Tiles are stored compressed and normally stream through untouched. Clients
    // that don't advertise the encoding (curl, QGIS) get them decompressed.
    if (!archive.tileEncoding) {
      res.end(Buffer.from(tile));
      return;
    }
    const accepts = res.req.headers["accept-encoding"] ?? "";
    if (typeof accepts === "string" && accepts.includes(archive.tileEncoding)) {
      res.setHeader("Content-Encoding", archive.tileEncoding);
      res.end(Buffer.from(tile));
      return;
    }
    if (archive.tileEncoding === "gzip") {
      res.end(gunzipSync(Buffer.from(tile)));
      return;
    }
    res.setHeader("Content-Encoding", archive.tileEncoding);
    res.end(Buffer.from(tile));
  }
}
