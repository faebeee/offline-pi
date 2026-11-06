import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.ts";
import { PlacesModule } from "../places/places.module.ts";
import { RegionsModule } from "../regions/regions.module.ts";
import { ToolsModule } from "../tools/tools.module.ts";
import { AssetsFetchCommand } from "./commands/assets-fetch.command.ts";
import { SetupCommand } from "./commands/setup.command.ts";

/**
 * Headless bootstrap only — regions are managed from the UI. Commands are
 * resolved out of `NestFactory.createApplicationContext`, so they share the
 * server's providers.
 */
@Module({
  imports: [RegionsModule, PlacesModule, AssetsModule, ToolsModule],
  providers: [SetupCommand, AssetsFetchCommand],
})
export class CliModule {}

export const COMMANDS = {
  setup: SetupCommand,
  "assets:fetch": AssetsFetchCommand,
} as const;

export type CommandName = keyof typeof COMMANDS;
