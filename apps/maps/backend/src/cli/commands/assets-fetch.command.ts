import { Injectable } from "@nestjs/common";
import { AssetsService } from "../../assets/assets.service.ts";
import { Command } from "../command.ts";

@Injectable()
export class AssetsFetchCommand extends Command {
  constructor(private readonly assets: AssetsService) {
    super();
  }

  async run(): Promise<void> {
    await this.assets.fetch();
  }
}
