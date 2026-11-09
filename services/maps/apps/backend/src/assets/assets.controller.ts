import { createReadStream } from "node:fs";
import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from "@nestjs/common";
import { PATHS } from "../config/paths.ts";
import { IMMUTABLE } from "../config/server.ts";
import { safeJoin, statFile } from "../common/files.ts";

const GLYPH_RANGE = /^\d+-\d+\.pbf$/;

/** Vendored glyphs and sprite sheets — the reason the viewer works offline. */
@Controller()
export class AssetsController {
  @Get("fonts/:fontstack/:range")
  @Header("Cache-Control", IMMUTABLE)
  async glyphs(
    @Param("fontstack") fontstack: string,
    @Param("range") range: string,
  ): Promise<StreamableFile> {
    if (!GLYPH_RANGE.test(range)) throw new NotFoundException("bad glyph range");

    // MapLibre sends comma-separated fallbacks; serve the first stack we have.
    for (const stack of decodeURIComponent(fontstack).split(",")) {
      const file = safeJoin(PATHS.fonts, stack.trim(), range);
      if (!file) continue;
      const stat = await statFile(file);
      if (!stat) continue;
      return new StreamableFile(createReadStream(file), {
        type: "application/x-protobuf",
        length: stat.size,
      });
    }
    throw new NotFoundException("glyph range not found");
  }

  @Get("sprites/*file")
  @Header("Cache-Control", IMMUTABLE)
  async sprite(@Param("file") segments: string[]): Promise<StreamableFile> {
    const name = segments.map(decodeURIComponent).join("/");
    const file = safeJoin(PATHS.sprites, name);
    const stat = file ? await statFile(file) : undefined;
    if (!file || !stat) throw new NotFoundException("sprite not found");

    return new StreamableFile(createReadStream(file), {
      type: name.endsWith(".png") ? "image/png" : "application/json",
      length: stat.size,
    });
  }
}
