import fs from "node:fs/promises";
import { Injectable } from "@nestjs/common";
import { PATHS } from "../../config/paths.ts";
import { AssetsService } from "../../assets/assets.service.ts";
import { PlacesService } from "../../places/places.service.ts";
import { PmtilesService } from "../../tools/pmtiles.service.ts";
import { c, log } from "../../common/terminal.ts";
import { Command } from "../command.ts";

/** One-time bootstrap: pmtiles binary, map assets, region catalog. */
@Injectable()
export class SetupCommand extends Command {
  constructor(
    private readonly pmtiles: PmtilesService,
    private readonly assets: AssetsService,
    private readonly places: PlacesService,
  ) {
    super();
  }

  async run(): Promise<void> {
    log(c.bold("offline-maps setup"));
    await fs.mkdir(PATHS.regionsDir, { recursive: true });

    await this.pmtiles.install();
    await this.assets.fetch();

    const catalog = await this.places.ensureCatalog();
    log(`${c.green("ok")} region catalog ready ${c.dim(`${catalog.length} named regions`)}`);

    log();
    log(`${c.bold("next:")} npm run region:add -- berlin`);
  }
}
