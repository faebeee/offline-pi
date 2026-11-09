// MapLibre setup shared by every map screen (maps, mesh map). Import this
// module instead of "maplibre-gl" directly.
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
// maplibre-gl v6 loads its worker from a separate file. Importing it as a URL
// makes Vite emit it as a local asset, so nothing is fetched from a CDN.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";

setWorkerUrl(workerUrl);

let pmtiles: Protocol | null = null;

/** Registers the pmtiles:// protocol once (range requests to /svc/<module>/...). */
export function registerPmtiles(): Protocol {
  if (!pmtiles) {
    pmtiles = new Protocol();
    maplibregl.addProtocol("pmtiles", pmtiles.tile);
  }
  return pmtiles;
}

export { maplibregl };
export * from "maplibre-gl";
