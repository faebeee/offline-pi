import { createReadStream } from "node:fs";
import path from "node:path";
import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { PATHS } from "../config/paths.ts";
import { IMMUTABLE } from "../config/server.ts";
import { contentTypeFor, safeJoin, statFile } from "../common/files.ts";

const NOT_BUILT =
  "Frontend not built yet.\n\n" +
  "  development:  npm run dev\n" +
  "  production:   npm run build && npm start\n";

/**
 * Last route in the app: serves the built viewer, falling back to index.html so
 * client-side routing works. Registered after every API route.
 */
@Controller()
export class SpaController {
  @Get("{*path}")
  async spa(@Param("path") segments: string[] | undefined, @Res() res: Response): Promise<void> {
    const requested = (segments ?? []).join("/");

    // Unknown API paths are a 404, not the viewer's index.html.
    if (requested.startsWith("api/")) throw new NotFoundException(`no route for /${requested}`);

    if (requested) {
      const asset = safeJoin(PATHS.publicDir, requested);
      if (asset && (await statFile(asset))) {
        res.setHeader("Content-Type", contentTypeFor(asset));
        res.setHeader("Cache-Control", IMMUTABLE);
        createReadStream(asset).pipe(res);
        return;
      }
    }

    const index = path.join(PATHS.publicDir, "index.html");
    if (await statFile(index)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      createReadStream(index).pipe(res);
      return;
    }

    res.status(404).type("text/plain").send(NOT_BUILT);
  }
}
