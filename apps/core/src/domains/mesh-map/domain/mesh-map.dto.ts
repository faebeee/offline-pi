// The mesh map domain: the radio's nodes on the regions downloaded in Maps.
// It combines the mesh-map container (region archives, fonts, sprites) with
// the mesh domain (nodes).
import { MeshNode } from '../../mesh/domain/mesh.dto';

export class MapRegion {
  name!: string;
  label!: string;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox!: number[];
  minzoom!: number;
  maxzoom!: number;
  /** archive for the pmtiles:// protocol, under core's passthrough */
  pmtilesUrl!: string;
}

export class MapAssets {
  /** MapLibre glyphs template, e.g. /svc/mesh-map/fonts/{fontstack}/{range}.pbf */
  glyphs!: string;
  /** sprite base without theme, e.g. /svc/mesh-map/sprites/ (append "light" or "dark") */
  spriteBase!: string;
}

export class MeshMapOverview {
  regions!: MapRegion[];
  assets!: MapAssets;
  /** the mesh module runs; nodes is empty otherwise */
  meshRunning!: boolean;
  /** our own node number (marks "you"), when the radio is connected */
  ownNum!: number | null;
  /** nodes with a position only */
  nodes!: MeshNode[];
}
