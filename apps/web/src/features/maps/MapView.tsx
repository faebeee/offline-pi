import type { GeoPolygon, Poi, Region } from "@offline-pi/api-client";
import { bearing as fmtBearing, toast } from "@offline-pi/ui/outpost.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "../../app/maplibre";
import { Icon } from "../../ui/outpost";
import { allStyleUrl, polygonBounds, regionsKey as toRegionsKey, toBbox, unionBbox, type Bbox } from "./lib";

const PREVIEW_SOURCE = "preview";

/** Touch equivalent of a right-click, in milliseconds. */
const LONG_PRESS_MS = 500;
/** How far a finger may wander before a long press counts as a pan instead. */
const LONG_PRESS_SLOP = 10;

export type Cursor = { lon: number; lat: number; zoom: number };

/** Last known own position, for the status strip. */
export type Fix = { lat: number; lon: number; accuracy: number; at: number };

/**
 * A region to frame. `at` is a timestamp so that picking the same region twice
 * still produces a new value and re-triggers the effect.
 */
export type RegionFocus = { bbox: Bbox; at: number };

type Props = {
  /** every downloaded region — all of them are rendered at once */
  regions: Region[];
  /** follows the UI theme: never a bright map in .t-dark */
  theme: "dark" | "light";
  /** boundary of a search result, drawn before it is downloaded */
  preview?: GeoPolygon;
  onCursor: (cursor: Cursor) => void;
  /** current viewport, so the panel can list only the POIs in view */
  onBounds: (bbox: Bbox) => void;
  pois: Poi[];
  selectedPoiId?: string | null;
  /** fly here when set; clear it once handled so the same POI can be revisited */
  focus?: { lat: number; lon: number } | null;
  /** frame this region when set, e.g. after clicking it in the panel */
  regionFocus?: RegionFocus | null;
  /** right-click or long-press on empty map */
  onPoiCreate: (lat: number, lon: number) => void;
  onPoiMove: (id: string, lat: number, lon: number) => void;
  onPoiSelect: (id: string) => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onFix: (fix: Fix | null) => void;
};

/** A token's current value (the map paints with real colours, not var()). */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  panelOpen,
  onTogglePanel,
  onFix,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [center, setCenter] = useState<{ lon: number; lat: number } | null>(null);
  // One MapLibre Marker per POI id, diffed against `pois` below.
  const markers = useRef(new Map<string, Marker>());
  const own = useRef<Marker | null>(null);
  const watch = useRef<number | null>(null);
  const follow = useRef(false);
  // The map is created once, so its listeners read the latest props from here
  // instead of closing over the first render's values.
  const handlers = useRef({ onPoiCreate, onPoiMove, onPoiSelect, onBounds, onCursor, onFix });
  handlers.current = { onPoiCreate, onPoiMove, onPoiSelect, onBounds, onCursor, onFix };

  // Identity of the region set: changes when one is added, removed or rebuilt.
  const regionsKey = toRegionsKey(regions);
  // With no region yet, still allow zooming in on a search preview.
  const maxZoom = regions.length ? Math.max(...regions.map((r) => r.maxzoom)) + 2 : 16;

  // Create the map once; styles and viewport are driven by the effects below.
  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new MapLibreMap({
      container: container.current,
      style: allStyleUrl(theme),
      bounds: unionBbox(regions),
      fitBoundsOptions: { padding: 24 },
      maxZoom,
      attributionControl: false,
      hash: true,
    });
    instance.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    instance.addControl(new AttributionControl({ compact: true }), "bottom-left");

    const report = () => {
      const { lng, lat } = instance.getCenter();
      handlers.current.onCursor({ lon: lng, lat, zoom: instance.getZoom() });
      const bounds = instance.getBounds();
      handlers.current.onBounds([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    };
    const settle = () => {
      const { lng, lat } = instance.getCenter();
      setCenter({ lon: lng, lat });
    };
    instance.on("move", report);
    instance.on("moveend", settle);
    instance.on("rotate", () => setRotation(instance.getBearing()));
    instance.on("mousemove", (e: MapMouseEvent) =>
      handlers.current.onCursor({ lon: e.lngLat.lng, lat: e.lngLat.lat, zoom: instance.getZoom() }),
    );
    // A manual pan stops following the own position.
    instance.on("dragstart", () => {
      follow.current = false;
    });
    instance.on("load", () => {
      setReady(true);
      report();
      settle();
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

    // The panel opens and closes next to the map, not just on window resize.
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);

    map.current = instance;
    return () => {
      resize.disconnect();
      cancelPress();
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", cancelPress);
      canvas.removeEventListener("touchcancel", cancelPress);
      for (const marker of markers.current.values()) marker.remove();
      markers.current.clear();
      own.current?.remove();
      own.current = null;
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
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

  // Frame a region picked from the panel.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !regionFocus) return;
    instance.fitBounds(regionFocus.bbox, { padding: 24, duration: 600 });
  }, [regionFocus, ready]);

  // Boundary of the candidate being considered in the add view, in --info.
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
        geometry: preview as unknown as GeoJSON.Geometry,
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
        paint: { "fill-color": token("--info-soft") },
      });
      instance.addLayer({
        id: `${PREVIEW_SOURCE}-line`,
        type: "line",
        source: PREVIEW_SOURCE,
        paint: { "line-color": token("--info"), "line-width": 2, "line-dasharray": [2, 1] },
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

  // Points of interest: square "saved place" markers with a mono label. DOM
  // markers survive setStyle (which drops custom sources), take their colours
  // from the tokens, and MapLibre gives us dragging for free.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const seen = new Set<string>();

    for (const poi of pois) {
      seen.add(poi.id);
      const existing = markers.current.get(poi.id);
      const selected = poi.id === selectedPoiId;

      if (existing) {
        const position = existing.getLngLat();
        if (position.lng !== poi.lon || position.lat !== poi.lat) {
          existing.setLngLat([poi.lon, poi.lat]);
        }
        const element = existing.getElement();
        const label = element.querySelector(".mk-label");
        if (label && label.textContent !== poi.name) label.textContent = poi.name;
        element.setAttribute("aria-label", `Saved place ${poi.name}`);
        element.setAttribute("aria-pressed", String(selected));
        continue;
      }

      const element = document.createElement("button");
      element.type = "button";
      element.className = "mk poi-mk";
      element.setAttribute("aria-label", `Saved place ${poi.name}`);
      element.setAttribute("aria-pressed", String(selected));
      const shape = document.createElement("span");
      shape.className = "mk-shape";
      const label = document.createElement("span");
      label.className = "mk-label";
      label.textContent = poi.name;
      element.append(shape, label);

      // Anchored at the top, then shifted up by half the 16 px square so the
      // square's centre sits on the coordinate and the label hangs below.
      const marker = new Marker({ element, anchor: "top", offset: [0, -8], draggable: true })
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

  // Centre on a POI picked from the panel.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !focus) return;
    instance.easeTo({
      center: [focus.lon, focus.lat],
      zoom: Math.max(instance.getZoom(), 13),
      duration: 600,
    });
  }, [focus, ready]);

  function locate() {
    const instance = map.current;
    if (!instance) return;
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      toast("Location needs HTTPS or localhost. Open the map on this device via localhost.");
      return;
    }
    follow.current = true;
    const marker = own.current;
    if (marker) {
      instance.easeTo({ center: marker.getLngLat(), zoom: Math.max(instance.getZoom(), 14) });
    }
    if (watch.current !== null) return;

    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        handlers.current.onFix({ lat, lon, accuracy, at: pos.timestamp });
        if (!own.current) {
          const element = document.createElement("div");
          element.className = "mk mk-own";
          element.setAttribute("role", "img");
          element.setAttribute("aria-label", "Your position");
          const shape = document.createElement("span");
          shape.className = "mk-shape";
          element.append(shape);
          own.current = new Marker({ element, anchor: "center" }).setLngLat([lon, lat]).addTo(instance);
        } else {
          own.current.setLngLat([lon, lat]);
        }
        if (follow.current) {
          instance.easeTo({ center: [lon, lat], zoom: Math.max(instance.getZoom(), 14) });
        }
      },
      (err) => {
        handlers.current.onFix(null);
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        toast(
          err.code === err.PERMISSION_DENIED
            ? "Location blocked. Allow it in the browser settings, then try again."
            : "No position fix. Move to open sky and try again.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
  }

  // Cache badge: which downloaded region the map centre falls in.
  const cached = useMemo(() => {
    if (!center) return undefined;
    return regions.find((r) => {
      const [minLon, minLat, maxLon, maxLat] = toBbox(r.bbox);
      return center.lon >= minLon && center.lon <= maxLon && center.lat >= minLat && center.lat <= maxLat;
    });
  }, [center, regions]);

  return (
    <div className="map-view">
      <div ref={container} className="map-canvas" />

      {center && regions.length > 0 && (
        <span
          className={`badge map-badge ${cached ? "badge-ok" : "badge-cau"}`}
          role="status"
        >
          <Icon name={cached ? "ok" : "caution"} />
          <span className="map-badge-text">
            {cached ? `Tiles cached · ${cached.label}` : "Not cached · outside regions"}
          </span>
        </span>
      )}

      <div className="map-ctrls">
        <button
          type="button"
          className="btn btn-icon"
          aria-label={panelOpen ? "Hide regions and places" : "Show regions and places"}
          aria-pressed={panelOpen}
          aria-controls="maps-panel"
          onClick={onTogglePanel}
        >
          <Icon name="list" />
        </button>
        <div className="group" role="group" aria-label="Zoom">
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Zoom in"
            onClick={() => map.current?.zoomIn()}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            aria-label="Zoom out"
            onClick={() => map.current?.zoomOut()}
          >
            <Icon name="minus" />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-icon map-compass"
          aria-label={`Reset to north, heading ${fmtBearing(rotation)}`}
          title={`Heading ${fmtBearing(rotation)}`}
          onClick={() => map.current?.easeTo({ bearing: 0, pitch: 0 })}
          style={{ "--map-bearing": `${-rotation}deg` } as React.CSSProperties}
        >
          <Icon name="compass" />
        </button>
      </div>

      <button type="button" className="map-locate" aria-label="Show my position" onClick={locate}>
        <Icon name="locate" />
      </button>
    </div>
  );
}
