import { Controller, Get, Head, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { PATHS } from "../config/paths.ts";
import { IMMUTABLE } from "../config/server.ts";
import { safeJoin, statFile } from "../common/files.ts";

/**
 * Raw archive passthrough. Express' `sendFile` does the byte-range work, so the
 * archives can be opened straight over HTTP by pmtiles clients and QGIS.
 */
@Controller("pmtiles")
export class ArchivesController {
  @Get(":file")
  @Head(":file")
  async archive(@Param("file") fileParam: string, @Res() res: Response): Promise<void> {
    if (!fileParam.endsWith(".pmtiles")) throw new NotFoundException("not a pmtiles archive");
    const name = fileParam.replace(/\.pmtiles$/, "");

    const file = safeJoin(PATHS.regionsDir, `${name}.pmtiles`);
    if (!file || !(await statFile(file))) {
      throw new NotFoundException(`unknown region "${name}"`);
    }

    await new Promise<void>((resolve, reject) => {
      res.sendFile(
        file,
        {
          acceptRanges: true,
          cacheControl: false,
          headers: {
            "Content-Type": "application/vnd.pmtiles",
            "Cache-Control": IMMUTABLE,
            "Access-Control-Expose-Headers":
              "Content-Length, Content-Range, Accept-Ranges, ETag",
          },
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }
}
