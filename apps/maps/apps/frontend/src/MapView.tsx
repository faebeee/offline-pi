import { useEffect, useRef, useState } from "react";
import {
  GeolocateControl,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  allStyleUrl,
  regionsKey as toRegionsKey,
  unionBbox,
  type Bbox,
  type Poi,
  type Polygon,
  type Region,
  type Theme,
} from "./api";

const PREVIEW_SOURCE = "preview";

/** Touch equivalent of a right-click, in milliseconds. */
const LONG_PRESS_MS = 500;
/** How far a finger may wander before a long press counts as a pan instead. */
const LONG_PRESS_SLOP = 10;

export type Cursor = { lon: number; lat: number; zoom: number };

/**
 * A region to frame. `at` is a timestamp so that picking the same region twice
 * still produces a new value and re-triggers the effect.
 */
export type RegionFocus = { bbox: Bbox; at: number };

type Props = {
  /** every downloaded region — all of them are rendered at once */
  regions: Region[];
  theme: Theme;
  /** boundary of a search result, drawn before it is downloaded */
  preview?: Polygon;
  onCursor: (cursor: Cursor) => void;
  /** current viewport, so the sidebar can list only the POIs in view */
  onBounds: (bbox: Bbox) => void;
  pois: Poi[];
  selectedPoiId?: string | null;
  /** fly here when set; clear it once handled so the same POI can be revisited */
  focus?: { lat: number; lon: number } | null;
  /** frame this region when set, e.g. after clicking it in the sidebar */
  regionFocus?: RegionFocus | null;
  /** right-click or long-press on empty map */
  onPoiCreate: (lat: number, lon: number) => void;
  onPoiMove: (id: string, lat: number, lon: number) => void;
  onPoiSelect: (id: string) => void;
};

export function MapView({
  regions,
  theme,
  preview,
  onCursor,
  onBounds,
  pois,
  selectedPoiId,
  focus,
  regionFocus,
  onPoiCreate,
  onPoiMove,
  onPoiSelect,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  // One MapLibre Marker per POI id, diffed against `pois` below.
  const markers = useRef(new Map<string, Marker>());
  // The map is created once, so its listeners read the latest props from here
  // instead of closing over the first render's values.
  const handlers = useRef({ onPoiCreate, onPoiMove, onPoiSelect, onBounds });
  handlers.current = { onPoiCreate, onPoiMove, onPoiSelect, onBounds };

  // Identity of the region set: changes when one is added, removed or rebuilt.
  const regionsKey = toRegionsKey(regions);
  const maxZoom = Math.max(...regions.map((r) => r.maxzoom), 0) + 2;

  // Create the map once; styles and viewport are driven by the effects below.
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: allStyleUrl(theme),
      bounds: unionBbox(regions),
      fitBoundsOptions: { padding: 24 },
      maxZoom,
      attributionControl: { compact: true },
      hash: true,
    });
    instance.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    instance.addControl(
      new ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-right",
    );
    instance.addControl(
      new GeolocateControl({ trackUserLocation: true }),
      "top-right",
    );

    const report = () => {
      const { lng, lat } = instance.getCenter();
      onCursor({ lon: lng, lat, zoom: instance.getZoom() });
      const bounds = instance.getBounds();
      handlers.current.onBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    };
    instance.on("move", report);
    instance.on("mousemove", (e: MapMouseEvent) =>
      onCursor({ lon: e.lngLat.lng, lat: e.lngLat.lat, zoom: instance.getZoom() }),
    );
    instance.on("load", () => {
      setReady(true);
      report();
    });

    // Right-click to drop a POI. The browser menu is suppressed by MapLibre.
    instance.on("contextmenu", (e: MapMouseEvent) => {
      handlers.current.onPoiCreate(e.lngLat.lat, e.lngLat.lng);
    });

    // Touch has no contextmenu, so synthesise one from a stationary long press.
    const canvas = instance.getCanvasContainer();
    let timer: number | undefined;
    let origin: { x: number; y: number } | null = null;

    const cancelPress = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      origin = null;
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return cancelPress();
      const touch = event.touches[0];
      if (!touch) return;
      const rect = canvas.getBoundingClientRect();
      const point = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      origin = point;
      timer = window.setTimeout(() => {
        const { lat, lng } = instance.unproject([point.x, point.y]);
        handlers.current.onPoiCreate(lat, lng);
        cancelPress();
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!origin || !touch) return cancelPress();
      const rect = canvas.getBoundingClientRect();
      const dx = touch.clientX - rect.left - origin.x;
      const dy = touch.clientY - rect.top - origin.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) cancelPress();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", cancelPress);
    canvas.addEventListener("touchcancel", cancelPress);

    map.current = instance;
    return () => {
      cancelPress();
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", cancelPress);
      canvas.removeEventListener("touchcancel", cancelPress);
      for (const marker of markers.current.values()) marker.remove();
      markers.current.clear();
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the combined style when the theme changes or a region is added,
  // removed or rebuilt. The viewport is deliberately left alone: `hash: true`
  // keeps the camera in the URL, and re-framing here would fight it.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    instance.setStyle(allStyleUrl(theme));
    instance.setMaxZoom(maxZoom);
  }, [regionsKey, theme, maxZoom, ready]);

  // Frame a region picked from the sidebar.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !regionFocus) return;
    instance.fitBounds(regionFocus.bbox, { padding: 24, duration: 600 });
  }, [regionFocus, ready]);

  // Boundary of the candidate being considered in the add dialog.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const attach = () => {
      if (!instance.isStyleLoaded()) return;

      if (!preview) {
        if (instance.getLayer(`${PREVIEW_SOURCE}-line`)) {
          instance.removeLayer(`${PREVIEW_SOURCE}-line`);
        }
        if (instance.getLayer(`${PREVIEW_SOURCE}-fill`)) {
          instance.removeLayer(`${PREVIEW_SOURCE}-fill`);
        }
        if (instance.getSource(PREVIEW_SOURCE)) instance.removeSource(PREVIEW_SOURCE);
        return;
      }

      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: preview as GeoJSON.Geometry,
      };
      const source = instance.getSource(PREVIEW_SOURCE) as GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
        return;
      }

      instance.addSource(PREVIEW_SOURCE, { type: "geojson", data });
      instance.addLayer({
        id: `${PREVIEW_SOURCE}-fill`,
        type: "fill",
        source: PREVIEW_SOURCE,
        paint: { "fill-color": "#4f8cff", "fill-opacity": 0.12 },
      });
      instance.addLayer({
        id: `${PREVIEW_SOURCE}-line`,
        type: "line",
        source: PREVIEW_SOURCE,
        paint: { "line-color": "#4f8cff", "line-width": 2, "line-dasharray": [2, 1] },
      });
    };

    attach();
    instance.on("styledata", attach);
    instance.on("idle", attach);
    return () => {
      instance.off("styledata", attach);
      instance.off("idle", attach);
    };
  }, [preview, ready]);

  // Frame a candidate so you can see what you are about to download.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !preview) return;
    const bounds = polygonBounds(preview);
    if (bounds) instance.fitBounds(bounds, { padding: 48, duration: 600 });
  }, [preview, ready]);

  // Points of interest. These are DOM markers rather than a symbol layer: they
  // survive setStyle (which drops custom sources), they render emoji without
  // any sprite or glyph work, and MapLibre gives us dragging for free.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const seen = new Set<string>();

    for (const poi of pois) {
      seen.add(poi.id);
      const existing = markers.current.get(poi.id);

      if (existing) {
        const position = existing.getLngLat();
        if (position.lng !== poi.lon || position.lat !== poi.lat) {
          existing.setLngLat([poi.lon, poi.lat]);
        }
        const element = existing.getElement();
        if (element.textContent !== poi.emoji) element.textContent = poi.emoji;
        element.title = poi.name;
        element.setAttribute("aria-label", `${poi.name} — ${poi.emoji}`);
        element.classList.toggle("selected", poi.id === selectedPoiId);
        continue;
      }

      const element = document.createElement("button");
      element.type = "button";
      element.className = poi.id === selectedPoiId ? "poi-marker selected" : "poi-marker";
      element.textContent = poi.emoji;
      element.title = poi.name;
      element.setAttribute("aria-label", `${poi.name} — ${poi.emoji}`);

      const marker = new Marker({ element, anchor: "bottom", draggable: true })
        .setLngLat([poi.lon, poi.lat])
        .addTo(instance);

      // A drag ends with a click on the element; ignore that one.
      let dragged = false;
      marker.on("dragstart", () => {
        dragged = true;
      });
      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        handlers.current.onPoiMove(poi.id, lat, lng);
      });
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (dragged) {
          dragged = false;
          return;
        }
        handlers.current.onPoiSelect(poi.id);
      });

      markers.current.set(poi.id, marker);
    }

    for (const [id, marker] of markers.current) {
      if (seen.has(id)) continue;
      marker.remove();
      markers.current.delete(id);
    }
  }, [pois, selectedPoiId, ready]);

  // Centre on a POI picked from the sidebar.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !focus) return;
    instance.easeTo({
      center: [focus.lon, focus.lat],
      zoom: Math.max(instance.getZoom(), 13),
      duration: 600,
    });
  }, [focus, ready]);

  return <div ref={container} className="map" />;
}

/** Bounding box of a preview polygon, for framing the map on it. */
function polygonBounds(polygon: Polygon): [number, number, number, number] | undefined {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
      return;
    }
    for (const child of node) visit(child);
  };
  visit(polygon.coordinates);
  return maxLon > minLon ? [minLon, minLat, maxLon, maxLat] : undefined;
}
