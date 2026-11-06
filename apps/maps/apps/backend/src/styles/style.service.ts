import { Injectable } from "@nestjs/common";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { Region, Theme } from "@offline-maps/shared";

const ATTRIBUTION =
  '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

/** MapLibre source id for a region. Region names are slugified, so this is safe. */
function sourceId(region: Region): string {
  return `pm-${region.name}`;
}

@Injectable()
export class StyleService {
  /**
   * Builds a MapLibre style for one region. Every URL points back at this
   * server, so the viewer never needs a CDN.
   */
  build(region: Region, theme: Theme, origin: string) {
    const flavor = namedFlavor(theme);
    return {
      version: 8 as const,
      name: `${region.label} (${theme})`,
      glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/sprites/${theme}`,
      sources: {
        protomaps: {
          type: "vector" as const,
          tiles: [`${origin}/tiles/${region.name}/{z}/{x}/{y}.mvt`],
          minzoom: region.minzoom,
          maxzoom: region.maxzoom,
          bounds: region.bbox,
          attribution: ATTRIBUTION,
        },
      },
      layers: [
        {
          id: "background",
          type: "background" as const,
          paint: { "background-color": flavor.background },
        },
        ...layers("protomaps", flavor, { lang: "en" }).filter((l) => l.id !== "background"),
      ],
    };
  }

  /**
   * Builds a single style that renders every region at once: one vector source
   * per region, each carrying the full basemap layer stack.
   *
   * The per-region stacks are interleaved by index rather than concatenated.
   * Concatenating would let a later region's land and water fills paint over an
   * earlier region's roads and labels wherever the two overlap; zipping keeps
   * the z-order consistent across all of them. Every stack has the same length
   * and order because they share a flavor and options.
   *
   * Each source declares its own `bounds`, so MapLibre only requests tiles
   * inside that region's extent — N sources does not mean N times the requests.
   */
  buildAll(regions: Region[], theme: Theme, origin: string) {
    const flavor = namedFlavor(theme);

    const background = {
      id: "background",
      type: "background" as const,
      paint: { "background-color": flavor.background },
    };

    const sources: Record<string, unknown> = {};
    for (const region of regions) {
      sources[sourceId(region)] = {
        type: "vector" as const,
        tiles: [`${origin}/tiles/${region.name}/{z}/{x}/{y}.mvt`],
        minzoom: region.minzoom,
        maxzoom: region.maxzoom,
        bounds: region.bbox,
        attribution: ATTRIBUTION,
      };
    }

    const stacks = regions.map((region) =>
      layers(sourceId(region), flavor, { lang: "en" }).filter((l) => l.id !== "background"),
    );
    const depth = stacks.reduce((max, stack) => Math.max(max, stack.length), 0);

    const interleaved = [];
    for (let i = 0; i < depth; i += 1) {
      for (const [index, stack] of stacks.entries()) {
        const layer = stack[i];
        const region = regions[index];
        if (!layer || !region) continue;
        interleaved.push({ ...layer, id: `${region.name}:${layer.id}` });
      }
    }

    return {
      version: 8 as const,
      name: `All regions (${theme})`,
      glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
      sprite: `${origin}/sprites/${theme}`,
      sources,
      layers: [background, ...interleaved],
    };
  }
}

