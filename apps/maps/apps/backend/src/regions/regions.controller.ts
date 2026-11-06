import fs from "node:fs/promises";
import { Controller, Delete, Get, HttpCode, NotFoundException, Param } from "@nestjs/common";
import type { RegionsResponse } from "@offline-maps/shared";
import { ArchiveService } from "./archive.service.ts";
import { RegistryService } from "./registry.service.ts";

@Controller("api/regions")
export class RegionsController {
  constructor(
    private readonly registry: RegistryService,
    private readonly archives: ArchiveService,
  ) {}

  @Get()
  async list(): Promise<RegionsResponse> {
    return { regions: await this.registry.readAvailable() };
  }

  /** Drops the archive and its registry entry. */
  @Delete(":name")
  @HttpCode(204)
  async remove(@Param("name") name: string): Promise<void> {
    const region = await this.registry.get(name);
    if (!region) throw new NotFoundException(`no region named "${name}"`);

    // Close first: the cached PMTiles handle would otherwise keep the deleted
    // file alive and serve tiles from a region that no longer exists.
    await this.archives.close(name);
    await fs.rm(this.registry.regionFile(name), { force: true });
    await this.registry.remove(name);
  }
}
