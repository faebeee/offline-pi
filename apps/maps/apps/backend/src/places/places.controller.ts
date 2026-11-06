import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import type { PlacesResponse } from "@offline-maps/shared";
import { PlacesService } from "./places.service.ts";

@Controller("api/places")
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** Candidate boundaries for a place name — the first step of adding a region. */
  @Get()
  async search(@Query("q") query?: string): Promise<PlacesResponse> {
    const q = (query ?? "").trim();
    if (q.length < 2) throw new BadRequestException("search for at least two characters");
    if (q.length > 120) throw new BadRequestException("search query too long");

    return { places: await this.places.search(q) };
  }
}
