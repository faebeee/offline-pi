import { useMeshMapOverview, type MapRegion, type MeshNode } from "@outpost/api-client";
import { ago, coords, getTheme, onVisibility, utcDateTime, type LinkState, type StripItem } from "@outpost/ui/outpost.js";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  Popup,
  registerPmtiles,
  ScaleControl,
  type GeoJSONSource,
  type GeoJSONSourceSpecification,
} from "../../app/maplibre";
import { useSocket, useSocketEvent } from "../../app/realtime";
import { useStripItems, useStripLink } from "../../app/strip";
import { Banner, Icon, useTheme } from "../../ui/outpost";
import { useModules } from "../modules/useModules";
import {
  AGE_LED,
  AGE_WORD,
  hasPosition,
  hops,
  metaLine,
  nodeAge,
  nodeBadge,
  nodeId,
  nodeName,
  positioned,
  type Positioned,
} from "./nodes";
import { buildStyle, unionBbox } from "./style";
import "./mesh-map.css";

const FOCUS_ZOOM = 13;
/** Side panel from this width (as in outpost.css .map-panel); a bottom sheet below. */
const WIDE = "(min-width: 720px)";
const isWide = () => window.matchMedia(WIDE).matches;

/** A value of a design token for the current theme (for MapLibre paint). */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Where the node list comes from: off (Mesh not installed), connecting,
 * stopped (Mesh installed but not running), unreachable (core lost the
 * Mesh container's live feed) or live.
 */
type MeshState = "off" | "connecting" | "stopped" | "unreachable" | "live";

const LINK: Record<MeshState, [LinkState, string]> = {
  live: ["ok", "MESH · LIVE"],
  connecting: ["cau", "MESH · CONNECTING"],
  stopped: ["crit", "MESH · STOPPED"],
  unreachable: ["crit", "MESH · NO ANSWER"],
  off: ["cau", "MESH · OFF"],
};

type Me = { lng: number; lat: number; accuracy: number };

/** Accuracy circle as a 48-point polygon (metres to degrees, fine at this scale). */
function accuracyGeoJSON(me: Me | null): GeoJSONSourceSpecification["data"] {
  if (!me) return { type: "FeatureCollection", features: [] };
  const ring: [number, number][] = [];
  const dLat = me.accuracy / 111_320;
  const dLng = dLat / Math.cos((me.lat * Math.PI) / 180);
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * 2 * Math.PI;
    ring.push([me.lng + dLng * Math.cos(a), me.lat + dLat * Math.sin(a)]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

function markerElement<K extends "button" | "div">(tag: K): HTMLElementTagNameMap[K] {
  const m = document.createElement(tag);
  m.className = "mk";
  const shape = document.createElement("span");
  shape.className = "mk-shape";
  const label = document.createElement("span");
  label.className = "mk-label";
  m.append(shape, label);
  return m;
}

const regionLabel = (regions: MapRegion[]) => {
  const names = regions.map((r) => r.label || r.name);
  return {
    shown: names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", "),
    all: names.join(", "),
  };
};

/**
 * Live map of the Meshtastic nodes on every region downloaded in Maps.
 * Positions come from core's mesh-map overview, updates from the /mesh
 * socket namespace (`node`, `nodes`, `status`, `link`).
 */
export function MeshMap({ linkedNode }: { linkedNode?: string }) {
  const overview = useMeshMapOverview({
    // while Mesh is down, look again now and then so the nodes appear once it is up
    query: { refetchInterval: (q) => (q.state.data?.meshRunning ? false : 10_000) },
  });
  const data = overview.data;
  const modules = useModules().data;
  const meshModule = modules?.modules.find((m) => m.id === "mesh");
  const meshInstalled = modules ? !!meshModule?.installed : true;
  const theme = useTheme();

  // ------------------------------------------------------------ node state
  const [nodes, setNodes] = useState<Map<number, MeshNode>>(() => new Map());
  const [ownNum, setOwnNum] = useState<number | null>(null);
  const [link, setLink] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!data) return;
    setNodes(new Map(data.nodes.map((n) => [n.num, n])));
    if (data.ownNum != null) setOwnNum(data.ownNum);
  }, [data]);

  const merge = useCallback((rows: MeshNode[]) => {
    setNodes((prev) => {
      const next = new Map(prev);
      for (const r of rows) next.set(r.num, r);
      return next;
    });
  }, []);

  const refetch = overview.refetch;
  const linkRef = useRef<boolean | null>(null);
  const { connected } = useSocket("/mesh");
  useSocketEvent("/mesh", "nodes", merge);
  useSocketEvent("/mesh", "node", (n) => merge([n]));
  useSocketEvent("/mesh", "status", (s) => {
    if (s.nodeNum != null) setOwnNum(s.nodeNum);
  });
  useSocketEvent("/mesh", "link", (l) => {
    // back after a break: reload the list, so nothing missed is lost
    if (l.connected && linkRef.current === false) void refetch();
    linkRef.current = l.connected;
    setLink(l.connected);
  });
  const wasConnected = useRef(false);
  useEffect(() => {
    if (connected && wasConnected.current) void refetch();
    if (!connected) setLink(null);
    else wasConnected.current = true;
  }, [connected, refetch]);

  const meshState: MeshState = !meshInstalled
    ? "off"
    : !data
      ? "connecting"
      : !data.meshRunning
        ? "stopped"
        : !connected || link == null
          ? "connecting"
          : link
            ? "live"
            : "unreachable";

  // keep "heard 5 min ago" and the ages current; skip while the page is hidden
  useEffect(() => {
    let visible = document.visibilityState === "visible";
    const off = onVisibility((v) => {
      visible = v;
      if (v) setNow(Date.now() / 1000);
    });
    const timer = window.setInterval(() => visible && setNow(Date.now() / 1000), 60_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, []);

  // ------------------------------------------------------ browser location
  const [me, setMe] = useState<Me | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const watchId = useRef<number | null>(null);
  const followOnFix = useRef(false);

  const stopLocate = useCallback(() => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setTracking(false);
    setMe(null);
  }, []);
  useEffect(() => stopLocate, [stopLocate]);

  // ----------------------------------------------------------------- strip
  const [linkState, linkLabel] = LINK[meshState];
  useStripLink(linkState, linkLabel);
  const stripItems: StripItem[] = [];
  if (meshState !== "off") stripItems.push({ label: "NODES", value: String(nodes.size) });
  if (me) stripItems.push({ label: "GNSS", value: `±${Math.round(me.accuracy)} M` });
  useStripItems(stripItems);

  // ------------------------------------------------------------------- map
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const northRef = useRef<HTMLButtonElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const popupEl = useMemo(() => document.createElement("div"), []);
  const popupRef = useRef<Popup | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(isWide);
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const styleKey = data ? JSON.stringify([data.regions.map((r) => r.pmtilesUrl), data.assets]) : "";
  const dataRef = useRef(data);
  dataRef.current = data;
  const appliedStyle = useRef("");
  const ready = !!data;

  useEffect(() => {
    const d = dataRef.current;
    if (!ready || !d || !containerRef.current) return;
    registerPmtiles();
    const theme0 = getTheme();
    appliedStyle.current = `${theme0}|${JSON.stringify([d.regions.map((r) => r.pmtilesUrl), d.assets])}`;
    const m = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(d.regions, d.assets, theme0, token("--map") || undefined),
      bounds: unionBbox(d.regions),
      fitBoundsOptions: { padding: 24 },
      maxZoom: d.regions.length ? Math.max(...d.regions.map((r) => r.maxzoom)) + 2 : 18,
      attributionControl: { compact: true },
      hash: true,
    });
    m.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    // the accuracy circle is a layer: re-added after every style swap
    m.on("style.load", () => {
      if (m.getSource("me-accuracy")) return;
      m.addSource("me-accuracy", { type: "geojson", data: accuracyGeoJSON(meRef.current) });
      m.addLayer({
        id: "me-accuracy-fill",
        type: "fill",
        source: "me-accuracy",
        paint: { "fill-color": token("--acc"), "fill-opacity": 0.12 },
      });
      m.addLayer({
        id: "me-accuracy-line",
        type: "line",
        source: "me-accuracy",
        paint: { "line-color": token("--acc"), "line-width": 1.5 },
      });
    });
    // the compass needle points north (outpost.css .map-compass)
    m.on("rotate", () => northRef.current?.style.setProperty("--map-bearing", `${-m.getBearing()}deg`));

    const popup = new Popup({ offset: 14, maxWidth: "300px", focusAfterOpen: false });
    popup.setDOMContent(popupEl);
    popup.on("close", () => setSelected(null));
    popupRef.current = popup;

    const ro = new ResizeObserver(() => m.resize());
    if (viewRef.current) ro.observe(viewRef.current);

    setMap(m);
    return () => {
      ro.disconnect();
      popup.remove();
      popupRef.current = null;
      m.remove();
      setMap(null);
    };
  }, [ready, popupEl]);

  // The map follows the UI theme (and new regions). Markers are DOM, so they
  // survive the swap.
  useEffect(() => {
    const d = dataRef.current;
    if (!map || !d) return;
    const key = `${theme}|${styleKey}`;
    if (appliedStyle.current === key) return;
    appliedStyle.current = key;
    map.setStyle(buildStyle(d.regions, d.assets, theme, token("--map") || undefined), { diff: false });
  }, [map, theme, styleKey]);

  // panel follows the screen width class
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setPanelOpen(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const rows = useMemo(() => positioned(nodes, ownNum), [nodes, ownNum]);

  const select = (num: number, fly: boolean) => {
    const n = nodes.get(num);
    if (!map || !n || !hasPosition(n)) return;
    setSelected(num);
    if (fly) map.easeTo({ center: [n.longitude, n.latitude], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
    // the phone sheet covers the map: close it so the popup is visible
    if (!isWide()) setPanelOpen(false);
  };
  const selectRef = useRef(select);
  selectRef.current = select;

  const fitNodes = () => {
    if (!map || !rows.length) return;
    const bounds = new LngLatBounds();
    for (const n of rows) bounds.extend([n.longitude, n.latitude]);
    map.fitBounds(bounds, { padding: 60, maxZoom: FOCUS_ZOOM, duration: 400 });
  };

  // Markers: a round .mk-node coloured by age (fresh ok, old cau, stale faded
  // grey), age written in the label for old/stale. The Pi's own node is the
  // amber own-position marker while the browser shows no position of its
  // own, and a square info marker labelled BASE once it does.
  const markers = useRef(new Map<number, Marker>());
  useEffect(() => {
    if (!map) return;
    const all = markers.current;
    const seen = new Set<number>();
    for (const n of rows) {
      seen.add(n.num);
      let marker = all.get(n.num);
      if (!marker) {
        const b = markerElement("button");
        b.type = "button";
        const num = n.num;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          selectRef.current(num, false);
        });
        marker = new Marker({ element: b, anchor: "top" }).setLngLat([n.longitude, n.latitude]).addTo(map);
        all.set(n.num, marker);
      } else {
        const at = marker.getLngLat();
        if (at.lng !== n.longitude || at.lat !== n.latitude) marker.setLngLat([n.longitude, n.latitude]);
      }
      const isMe = n.num === ownNum;
      const own = isMe && !me;
      const age = nodeAge(n, now);
      const b = marker.getElement();
      b.classList.toggle("mk-own", own);
      b.classList.toggle("mk-node", !isMe);
      for (const a of ["fresh", "old", "stale"] as const) b.classList.toggle(`is-${a}`, !isMe && a === age);
      b.setAttribute("aria-pressed", String(selected === n.num));
      marker.setOffset([0, own ? -9 : -8]);

      const short = nodeBadge(n);
      const label = isMe ? `${short} · Base` : age === "fresh" ? short : `${short} · ${ago(n.lastHeard, now).replace(/ AGO$/, "")}`;
      b.querySelector(".mk-label")!.textContent = label;
      const spoken = isMe
        ? `${nodeName(n)}, this Pi (base station)`
        : `${nodeName(n)}, ${AGE_WORD[age].toLowerCase()}, heard ${ago(n.lastHeard, now).toLowerCase()}`;
      b.setAttribute("aria-label", spoken);
      b.title = spoken;
    }
    for (const [num, marker] of all) {
      if (seen.has(num)) continue;
      marker.remove();
      all.delete(num);
    }
  }, [map, rows, ownNum, me, now, selected]);
  useEffect(
    () => () => {
      for (const m of markers.current.values()) m.remove();
      markers.current.clear();
    },
    [map],
  );

  // the browser's own position: amber marker + accuracy circle
  const meMarker = useRef<Marker | null>(null);
  useEffect(() => {
    if (!map) return;
    (map.getSource("me-accuracy") as GeoJSONSource | undefined)?.setData(accuracyGeoJSON(me));
    if (!me) {
      meMarker.current?.remove();
      meMarker.current = null;
      return;
    }
    if (!meMarker.current) {
      const m = markerElement("div");
      m.classList.add("mk-own");
      m.setAttribute("role", "img");
      m.setAttribute("aria-label", "Your position");
      m.querySelector(".mk-label")!.textContent = "You";
      meMarker.current = new Marker({ element: m, anchor: "top", offset: [0, -9] }).setLngLat([me.lng, me.lat]).addTo(map);
    } else {
      meMarker.current.setLngLat([me.lng, me.lat]);
    }
  }, [map, me]);
  useEffect(
    () => () => {
      meMarker.current?.remove();
      meMarker.current = null;
    },
    [map],
  );

  // popup follows the selected node
  const selectedNode = selected != null ? nodes.get(selected) : undefined;
  const selectedPos = selectedNode && hasPosition(selectedNode) ? selectedNode : null;
  useEffect(() => {
    const popup = popupRef.current;
    if (!map || !popup) return;
    if (selectedPos) {
      popup.setLngLat([selectedPos.longitude, selectedPos.latitude]);
      if (!popup.isOpen()) popup.addTo(map);
    } else if (popup.isOpen()) {
      popup.remove();
    }
  }, [map, selectedPos?.num, selectedPos?.longitude, selectedPos?.latitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // `?node=!abcd1234` (Mesh's "Show on map"): open it once it loads; else
  // frame the nodes on first load unless the URL already has a camera
  const linked = useRef(linkedNode ?? null);
  const framed = useRef(/^#\d/.test(location.hash) || linkedNode != null);
  useEffect(() => {
    if (!map) return;
    if (linked.current) {
      const n = rows.find((x) => nodeId(x) === linked.current);
      if (n) {
        linked.current = null;
        selectRef.current(n.num, true);
        // drop the parameter so a reload doesn't jump back; keep the camera hash
        history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
      }
    } else if (!framed.current && rows.length) {
      framed.current = true;
      const bounds = new LngLatBounds();
      for (const n of rows) bounds.extend([n.longitude, n.latitude]);
      map.fitBounds(bounds, { padding: 60, maxZoom: FOCUS_ZOOM, duration: 400 });
    }
  }, [map, rows]);

  const locate = () => {
    if (watchId.current != null) {
      // already tracking: recentre
      if (me && map) map.easeTo({ center: [me.lng, me.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
      return;
    }
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      setLocateError(
        "This browser only shares its position with pages on HTTPS or localhost; this page is plain HTTP on the local network. Node positions still work.",
      );
      return;
    }
    followOnFix.current = true;
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy };
        setMe(next);
        setLocateError(null);
        if (followOnFix.current && map) {
          followOnFix.current = false;
          map.easeTo({ center: [next.lng, next.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
        }
      },
      (err) => {
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Allow it for this page in the browser settings to show your position."
            : "No position fix from this device yet. Try again outside or near a window.",
        );
        stopLocate();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  };

  // ------------------------------------------------------------- render
  if (overview.error && !data) {
    return (
      <div className="mm-notices">
        <Banner
          tone="crit"
          title="Can't load the mesh map"
          action={
            <button type="button" className="btn btn-crit" onClick={() => void overview.refetch()}>
              <Icon name="refresh" />
              Retry
            </button>
          }
        >
          {overview.error.message}
        </Banner>
      </div>
    );
  }

  const regions = data?.regions ?? [];
  const cache = regionLabel(regions);
  const stale = nodes.size ? " Showing positions as last loaded, with their age." : "";
  const without = nodes.size - rows.length;
  const meshPath = meshModule?.installed ? meshModule.path : null;

  let empty: [string, string, string] | null = null;
  if (!rows.length) {
    if (meshState === "off") empty = ["offline", "Mesh is not installed", "Add the Mesh module with ./install.sh to see nodes here."];
    else if (meshState === "connecting") empty = ["mesh", "Connecting", "Reading the node list from Mesh."];
    else if (meshState === "stopped") empty = ["offline", "Mesh is not running", "Nodes appear once it is started."];
    else if (meshState === "unreachable")
      empty = ["offline", "No node data", "Mesh is not answering. Nodes appear once it is reachable."];
    else if (nodes.size) empty = ["waypoint", "No positions yet", "Nodes appear here once their owners share a position."];
    else empty = ["mesh", "No nodes heard", "Nodes appear here as the radio hears them."];
  }

  const notices = [];
  if (meshState === "stopped") {
    notices.push(
      <Banner
        key="stopped"
        tone="cau"
        title="Mesh is not running"
        action={
          <Link to="/" className="btn">
            Home
          </Link>
        }
      >
        {`Start the Mesh module on the home page; this map picks up the nodes automatically.${stale}`}
      </Banner>,
    );
  } else if (meshState === "unreachable") {
    notices.push(
      <Banner key="unreachable" tone="cau" title="Mesh is not answering">
        {`Retrying automatically.${stale}`}
      </Banner>,
    );
  } else if (meshState === "off") {
    notices.push(
      <Banner key="off" tone="info" title="Mesh is not installed">
        Add the Mesh module with ./install.sh to see nodes here.
      </Banner>,
    );
  }
  if (data && !regions.length) {
    notices.push(
      <Banner key="nomap" tone="info" title="No offline map">
        Download a region in Maps; it shows up here on the next visit. Nodes are still placed on the blank map.
      </Banner>,
    );
  }
  if (locateError) {
    notices.push(
      <Banner
        key="locate"
        tone="cau"
        title="Position unavailable"
        action={
          <button type="button" className="btn btn-icon btn-ghost" aria-label="Dismiss" title="Dismiss" onClick={() => setLocateError(null)}>
            <Icon name="close" />
          </button>
        }
      >
        {locateError}
      </Banner>,
    );
  }

  return (
    <>
      {notices.length > 0 && (
        <div className="mm-notices" aria-live="polite">
          {notices}
        </div>
      )}
      <div className="map-stage">
        <div className="map-view" ref={viewRef}>
          <div ref={containerRef} className="map-canvas" role="region" aria-label="Map of mesh nodes" />
          {data &&
            (regions.length ? (
              <span className="badge badge-ok map-badge" title={`Offline tiles: ${cache.all}`}>
                <Icon name="ok" />
                <span className="map-badge-text">Tiles cached · {cache.shown}</span>
              </span>
            ) : (
              <span className="badge badge-cau map-badge">
                <Icon name="caution" />
                <span className="map-badge-text">No offline tiles</span>
              </span>
            ))}
          <div className="map-ctrls">
            <button
              type="button"
              className="btn btn-icon"
              aria-controls="mm-panel"
              aria-expanded={panelOpen}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? "Hide node list" : "Show node list"}
              title="Node list"
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <Icon name="list" />
            </button>
            <div className="group">
              <button type="button" className="btn btn-icon" aria-label="Zoom in" title="Zoom in" onClick={() => map?.zoomIn()}>
                <Icon name="plus" />
              </button>
              <button type="button" className="btn btn-icon" aria-label="Zoom out" title="Zoom out" onClick={() => map?.zoomOut()}>
                <Icon name="minus" />
              </button>
            </div>
            <button
              ref={northRef}
              type="button"
              className="btn btn-icon map-compass"
              aria-label="Reset to north up"
              title="North up"
              onClick={() => map?.resetNorthPitch()}
            >
              <Icon name="compass" />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Show all nodes"
              title="Show all nodes"
              disabled={rows.length === 0}
              onClick={fitNodes}
            >
              <Icon name="fit" />
            </button>
          </div>
          <button
            type="button"
            className="map-locate"
            aria-pressed={tracking}
            aria-label="Show my position"
            title="My position"
            onClick={locate}
          >
            <Icon name="locate" />
          </button>
        </div>
        <aside id="mm-panel" className="map-panel" aria-labelledby="mm-panel-title" hidden={!panelOpen}>
          <div className="map-panel-head">
            <div className="map-panel-title">
              <h2 id="mm-panel-title" className="h2">
                Nodes
              </h2>
              <span className="label">
                {nodes.size
                  ? `${rows.length} on map${without > 0 ? ` · ${without} without position` : ""}`
                  : meshState === "live"
                    ? "0 heard"
                    : ""}
              </span>
            </div>
            <button type="button" className="btn btn-icon" aria-label="Close node list" title="Close" onClick={() => setPanelOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="map-panel-body flush">
            {empty && (
              <div className="empty">
                <Icon name={empty[0]} />
                <p className="empty-title">{empty[1]}</p>
                <p>{empty[2]}</p>
              </div>
            )}
            <ul className="list">
              {rows.map((n) => {
                const isMe = n.num === ownNum;
                const age = nodeAge(n, now);
                return (
                  <li key={n.num}>
                    <button
                      type="button"
                      className="row has-mono"
                      aria-current={selected === n.num ? "true" : undefined}
                      onClick={() => select(n.num, true)}
                    >
                      <span className="monogram">{nodeBadge(n).slice(0, 4)}</span>
                      <span className="row-main">
                        <span className="row-title">{nodeName(n)}</span>
                        <span className="row-meta">{metaLine(n, ownNum, now)}</span>
                      </span>
                      <span className="row-value status">
                        <span className={`led ${isMe ? "led-info" : AGE_LED[age]}`} />
                        <span>{isMe ? "BASE" : AGE_WORD[age].toUpperCase()}</span>
                      </span>
                      <Icon name="chevron" className="i-sm" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
      {selectedPos &&
        createPortal(<NodePopup n={selectedPos} ownNum={ownNum} now={now} meshPath={meshPath} />, popupEl)}
    </>
  );
}

function NodePopup({ n, ownNum, now, meshPath }: { n: Positioned; ownNum: number | null; now: number; meshPath: string | null }) {
  const isMe = n.num === ownNum;
  const age = nodeAge(n, now);
  const rows: [string, React.ReactNode][] = [];
  const add = (key: string, value: React.ReactNode) => {
    if (value != null) rows.push([key, value]);
  };
  if (!isMe) {
    add(
      "Status",
      <span className="status">
        <span className={`led ${AGE_LED[age]}`} />
        <span>{`${AGE_WORD[age]} · ${ago(n.lastHeard, now)}`}</span>
      </span>,
    );
    add("Heard", n.lastHeard ? utcDateTime(n.lastHeard * 1000) : "Never");
    add("Hops", hops(n)?.toUpperCase() ?? null);
    add("SNR", n.snr == null ? null : `${n.snr} dB`);
  }
  add("Battery", n.battery == null ? null : n.battery > 100 ? "PLUGGED IN" : `${n.battery}%${n.voltage ? ` · ${n.voltage} V` : ""}`);
  add("Alt", n.altitude == null ? null : `${n.altitude} m`);
  add("Pos", coords(n.latitude, n.longitude));
  add("HW", n.hwModel ? n.hwModel.replaceAll("_", " ") : null);

  return (
    <div className="map-popup">
      <div className="map-popup-head">
        <strong className="map-popup-title">{nodeName(n)}</strong>
        <span className="label">{isMe ? `${nodeId(n)} · this Pi` : nodeId(n)}</span>
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} className="mm-kv-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {meshPath && (
        <Link to={meshPath} className="btn btn-block">
          <Icon name="message" className="i-sm" />
          {isMe ? "Open Mesh" : "Message in Mesh"}
        </Link>
      )}
    </div>
  );
}
