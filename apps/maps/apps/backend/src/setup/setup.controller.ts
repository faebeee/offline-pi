import path from "node:path";
import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import type { Job, Status } from "@offline-maps/shared";
import { PATHS } from "../config/paths.ts";
import { exists } from "../common/files.ts";
import { AssetsService } from "../assets/assets.service.ts";
import { JobsService } from "../jobs/jobs.service.ts";
import { PlacesService } from "../places/places.service.ts";
import { RegistryService } from "../regions/registry.service.ts";
import { PmtilesService } from "../tools/pmtiles.service.ts";

/** First-run bootstrap, so a fresh clone never needs the CLI. */
@Controller("api")
export class SetupController {
  constructor(
    private readonly pmtiles: PmtilesService,
    private readonly assets: AssetsService,
    private readonly places: PlacesService,
    private readonly registry: RegistryService,
    private readonly jobs: JobsService,
  ) {}

  @Get("status")
  async status(): Promise<Status> {
    const installed = await this.pmtiles.isInstalled();
    const [fonts, sprites, catalogReady, regions] = await Promise.all([
      exists(path.join(PATHS.fonts, "Noto Sans Regular", "0-255.pbf")),
      exists(path.join(PATHS.sprites, "light.json")),
      exists(PATHS.geofabrikIndex),
      this.registry.readAvailable(),
    ]);

    const status: Status = {
      pmtiles: { installed },
      assets: { fonts, sprites },
      catalog: { ready: catalogReady, count: 0 },
      regions: regions.length,
      ready: installed && fonts && sprites,
    };
    if (installed) status.pmtiles.version = await this.pmtiles.version().catch(() => undefined);
    if (catalogReady) status.catalog.count = (await this.places.ensureCatalog()).length;
    return status;
  }

  /** Installs the pmtiles binary, vendors fonts and sprites, fetches the catalog. */
  @Post("setup")
  @HttpCode(202)
  run(): Job {
    return this.jobs.start("setup", "installing tools", async (ctx) => {
      ctx.setStage("installing pmtiles");
      await this.pmtiles.install((line) => ctx.log(line));

      ctx.setStage("downloading fonts and sprites");
      await this.assets.fetch((line) => ctx.log(line));

      ctx.setStage("fetching region catalog");
      const catalog = await this.places.ensureCatalog((line) => ctx.log(line));
      ctx.log(`region catalog ready (${catalog.length} named regions)`);
    });
  }
}
