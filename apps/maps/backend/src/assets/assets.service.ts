import fs from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { PATHS } from "../config/paths.ts";
import { UPSTREAM } from "../config/upstream.ts";
import { exists, replaceDir } from "../common/files.ts";
import { download, run } from "../common/net.ts";
import { c, formatBytes, log, type Report } from "../common/terminal.ts";

@Injectable()
export class AssetsService {
  /**
   * Vendors glyphs and sprites from protomaps/basemaps-assets so the viewer
   * never needs to reach a CDN for fonts or icons.
   */
  async fetch(report: Report = log): Promise<void> {
    const fontsReady = await exists(path.join(PATHS.fonts, "Noto Sans Regular", "0-255.pbf"));
    const spritesReady = await exists(path.join(PATHS.sprites, "light.json"));
    if (fontsReady && spritesReady) {
      report(`${c.green("ok")} map assets already present ${c.dim("assets/fonts, assets/sprites")}`);
      return;
    }

    report(`${c.cyan("→")} downloading map assets ${c.dim("(fonts + sprites)")}`);
    const staging = path.join(PATHS.tmp, "assets");
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const tarball = path.join(staging, "basemaps-assets.tar.gz");

    try {
      await download(UPSTREAM.basemapsAssets, tarball, {
        label: "assets",
        onProgress: (received) => report(`  fonts + sprites ${formatBytes(received)}`),
      });
      await run("tar", ["-xzf", tarball, "-C", staging, "--strip-components=1"], { quiet: true });

      // swap in the new folders instead of deleting the old ones first: on a
      // damaged exFAT drive the old ones may not be removable (replaceDir)
      const leftovers = [
        ...(await replaceDir(path.join(staging, "fonts"), PATHS.fonts)),
        // Flatten sprites/v4/* to sprites/*: v4 is what @protomaps/basemaps v5 styles use.
        ...(await replaceDir(path.join(staging, "sprites", "v4"), PATHS.sprites)),
      ];
      for (const p of leftovers) {
        report(`${c.yellow("!")} could not remove the old ${path.basename(p)} (damaged file system? run fsck on the drive)`);
      }

      const stacks = (await fs.readdir(PATHS.fonts, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      const sprites = (await fs.readdir(PATHS.sprites)).filter((f) => f.endsWith(".json")).length;
      report(`${c.green("ok")} ${stacks.length} font stacks, ${sprites} sprite sheets`);
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
}
