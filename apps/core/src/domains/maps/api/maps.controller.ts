import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CreateDownloadRequest,
  CreatePoiRequest,
  Job,
  JobsResponse,
  MapsStatus,
  PlacesResponse,
  Poi,
  PoisResponse,
  RegionsResponse,
  UpdatePoiRequest,
} from '../domain/maps.dto';
import { MapsClient } from '../infrastructure/maps.client';

/**
 * Domain "maps": offline vector maps (the maps container). JSON API here;
 * tiles, fonts, sprites and .pmtiles files go through the passthrough at
 * /svc/maps/. Live job progress: socket namespace /maps.
 */
@ApiTags('maps')
@Controller('api/maps')
export class MapsController {
  constructor(private readonly maps: MapsClient) {}

  /** What the first-run setup still has to do. */
  @Get('status')
  status(): Promise<MapsStatus> {
    return this.maps.status();
  }

  /** Start the first-run setup (pmtiles, fonts, sprites, catalogue). */
  @Post('setup')
  @HttpCode(202)
  setup(): Promise<Job> {
    return this.maps.setup();
  }

  @Get('regions')
  regions(): Promise<RegionsResponse> {
    return this.maps.regions();
  }

  @Delete('regions/:name')
  @HttpCode(204)
  async deleteRegion(@Param('name') name: string): Promise<void> {
    await this.maps.deleteRegion(name);
  }

  /** Candidate boundaries for a new region (Geofabrik index, Nominatim). */
  @Get('places')
  places(@Query('q') q: string): Promise<PlacesResponse> {
    return this.maps.places(q ?? '');
  }

  /** Estimate a download; it waits in "awaiting-confirmation". */
  @Post('downloads')
  @HttpCode(202)
  createDownload(@Body() body: CreateDownloadRequest): Promise<Job> {
    return this.maps.createDownload(body);
  }

  @Post('downloads/:id/confirm')
  @HttpCode(200)
  confirmDownload(@Param('id') id: string): Promise<Job> {
    return this.maps.confirmDownload(id);
  }

  @Get('jobs')
  jobs(): Promise<JobsResponse> {
    return this.maps.jobs();
  }

  @Get('jobs/:id')
  job(@Param('id') id: string): Promise<Job> {
    return this.maps.job(id);
  }

  /** Cancel a running job, or decline one waiting for confirmation. */
  @Delete('jobs/:id')
  cancelJob(@Param('id') id: string): Promise<Job> {
    return this.maps.cancelJob(id);
  }

  @Get('pois')
  @ApiQuery({ name: 'bbox', required: false, description: 'minLon,minLat,maxLon,maxLat' })
  pois(@Query('bbox') bbox?: string): Promise<PoisResponse> {
    return this.maps.pois(bbox);
  }

  @Post('pois')
  createPoi(@Body() body: CreatePoiRequest): Promise<Poi> {
    return this.maps.createPoi(body);
  }

  @Patch('pois/:id')
  updatePoi(@Param('id') id: string, @Body() body: UpdatePoiRequest): Promise<Poi> {
    return this.maps.updatePoi(id, body);
  }

  @Delete('pois/:id')
  @HttpCode(204)
  async deletePoi(@Param('id') id: string): Promise<void> {
    await this.maps.deletePoi(id);
  }

  /**
   * MapLibre style for one region, or "_all" for every region at once. Its
   * source URLs point at /svc/maps/ on the host the browser used.
   */
  @Get('styles/:name')
  @ApiQuery({ name: 'theme', required: false, enum: ['light', 'dark', 'white', 'grayscale', 'black'] })
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  style(
    @Param('name') name: string,
    @Query('theme') theme: string | undefined,
    @Headers('host') host: string | undefined,
  ): Promise<Record<string, unknown>> {
    return this.maps.style(name, theme ?? 'light', host);
  }
}
