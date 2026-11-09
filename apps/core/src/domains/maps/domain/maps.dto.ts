// The maps domain's contract. It mirrors @offline-pi/maps-shared (the maps
// container's own types); infrastructure/maps.mappers.ts checks at compile
// time that the container's shapes fit these classes.
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

/** GeoJSON Polygon or MultiPolygon. */
export class GeoPolygon {
  type!: 'Polygon' | 'MultiPolygon';
  /** number[][][] (Polygon) or number[][][][] (MultiPolygon) */
  coordinates!: unknown[];
}

export class RegionRef {
  name!: string;
  label!: string;
  minzoom!: number;
  maxzoom!: number;
}

export class Region {
  /** url-safe id, e.g. "switzerland" */
  name!: string;
  label!: string;
  source!: 'geofabrik' | 'nominatim';
  /** [minLon, minLat, maxLon, maxLat] */
  bbox!: number[];
  /** [lon, lat] */
  center!: number[];
  minzoom!: number;
  maxzoom!: number;
  /** protomaps build date, YYYYMMDD */
  build!: string;
  bytes!: number;
  addedAt!: string;
  polygon?: GeoPolygon;
}

export class RegionsResponse {
  regions!: Region[];
}

export class PlaceCandidate {
  id!: string;
  /** suggested region id, e.g. "berlin" */
  name!: string;
  label!: string;
  /** context when disambiguating, e.g. "Germany" or the OSM type */
  detail!: string;
  source!: 'geofabrik' | 'nominatim';
  /** [minLon, minLat, maxLon, maxLat] */
  bbox!: number[];
  /** rough degree span, e.g. "0.38° × 0.42°" */
  span!: string;
  /** coarse outline for the map */
  preview!: GeoPolygon;
}

export class PlacesResponse {
  places!: PlaceCandidate[];
}

export class DownloadEstimate {
  archiveBytes!: number;
  transferBytes!: number;
  build!: string;
  /** set when the archive would not comfortably fit on the disk */
  diskWarning?: string;
}

export class JobProgress {
  bytes!: number;
  /** expected total; 0 when unknown */
  total!: number;
  percent!: number;
}

export class Job {
  id!: string;
  type!: 'download' | 'setup';
  state!: 'estimating' | 'awaiting-confirmation' | 'running' | 'done' | 'failed' | 'cancelled';
  /** short label for the current step, e.g. "downloading tiles" */
  stage!: string;
  createdAt!: string;
  updatedAt!: string;
  /** download jobs only */
  region?: RegionRef;
  estimate?: DownloadEstimate;
  progress?: JobProgress;
  error?: string;
  log!: string[];
}

export class JobsResponse {
  jobs!: Job[];
}

export class CreateDownloadRequest {
  @IsString()
  placeId!: string;
  /** override the region id used in URLs and filenames */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  name?: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  minzoom?: number;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(15)
  maxzoom?: number;
  /** planet build to extract from, YYYYMMDD; omit for the latest */
  @IsOptional()
  @Matches(/^\d{8}$/)
  build?: string;
  /** replace an existing region of the same name */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class Poi {
  id!: string;
  name!: string;
  /** a single emoji, rendered as the map marker */
  emoji!: string;
  lat!: number;
  lon!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class PoisResponse {
  pois!: Poi[];
}

export class CreatePoiRequest {
  @IsString()
  @Length(1, 80)
  name!: string;
  @IsString()
  @Length(1, 8)
  emoji!: string;
  @Type(() => Number)
  @IsLatitude()
  lat!: number;
  @Type(() => Number)
  @IsLongitude()
  lon!: number;
}

export class UpdatePoiRequest {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;
  @IsOptional()
  @IsString()
  @Length(1, 8)
  emoji?: string;
  @IsOptional()
  @IsLatitude()
  lat?: number;
  @IsOptional()
  @IsLongitude()
  lon?: number;
}

export class PmtilesStatus {
  installed!: boolean;
  version?: string;
}

export class AssetsStatus {
  fonts!: boolean;
  sprites!: boolean;
}

export class CatalogStatus {
  ready!: boolean;
  count!: number;
}

/** What the first-run setup still has to do. */
export class MapsStatus {
  pmtiles!: PmtilesStatus;
  assets!: AssetsStatus;
  catalog!: CatalogStatus;
  regions!: number;
  /** true once tiles can be downloaded and rendered */
  ready!: boolean;
}

/** Where the browser loads a region's map data from (core's passthrough). */
export class MapsLinks {
  /** e.g. /svc/maps/pmtiles/{name}.pmtiles */
  pmtiles!: string;
}
