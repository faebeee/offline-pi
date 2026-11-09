import "maplibre-gl/dist/maplibre-gl.css";
import "@offline-pi/ui/outpost.css";
import "./styles.css";
import { addProtocol, LngLatBounds, Map as MapLibreMap, Marker, Popup, ScaleControl } from "maplibre-gl";
import type { GeoJSONSource, GeoJSONSourceSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import {
  ago,
  coords,
  frame,
  getTheme,
  icon,
  MODULES,
  onVisibility,
  utcDateTime,
  type LinkState,
  type StripItem,
} from "@offline-pi/ui/outpost.js";
import {
  connectMesh,
  hasPosition,
  nodeAge,
  nodeBadge,
  nodeId,
  nodeName,
  type MeshNode,
  type MeshReason,
  type MeshState,
} from "./mesh";
import { buildStyle, unionBbox, type Region } from "./style";

type Config = { regions: Region[] };
type Positioned = MeshNode & { latitude: number; longitude: number };
type Age = ReturnType<typeof nodeAge>;

const FOCUS_ZOOM = 13;
/** Side panel from this width (as in outpost.css .map-panel); a bottom sheet below. */
const WIDE = window.matchMedia("(min-width: 720px)");

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};
/** A value of a design token for the current theme (for MapLibre paint). */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// Frame first: applies the stored theme before the map picks its style.
const { strip, modules } = frame("mesh-map");

// ------------------------------------------------------------------ state

let nodes = new Map<number, MeshNode>();
let myNum: number | null = null;
let meshState: MeshState | "off" = "connecting";
let meshReason: MeshReason | undefined;
let now = Date.now() / 1000;
let selected: number | null = null;
let panelOpen = WIDE.matches;
const markers = new Map<number, Marker>();
// `?node=!abcd1234` from the Mesh module's "Show on map": open it once it loads.
let linkedNode = new URLSearchParams(location.search).get("node");
// Frame the nodes on first load unless the URL already has a camera.
let framed = /^#\d/.test(location.hash) || linkedNode != null;

// Browser location (DESIGN.md: own position = amber marker + accuracy circle).
let me: { lng: number; lat: number; accuracy: number } | null = null;
let watchId: number | null = null;
let followOnFix = false;
let locateError: string | null = null;

// This page is served by core under /mesh-map/: the data routes are relative
// to it, and the Mesh module is a sibling path on the same origin.
const base = new URL(".", location.href).href.replace(/\/$/, "");
const config = await fetch("api/config")
  .then((r) => r.json() as Promise<Config>)
  .catch((): Config => ({ regions: [] }));
await modules;
const meshModule = MODULES.find((m) => m.id === "mesh");
const meshUrl = meshModule ? new URL(meshModule.path, location.origin).href.replace(/\/$/, "") : null;

// ------------------------------------------------------------------- map

const protocol = new Protocol();
addProtocol("pmtiles", protocol.tile);

const style = () => buildStyle(config.regions, getTheme(), base, token("--map") || undefined);
const maxZoom = config.regions.length ? Math.max(...config.regions.map((r) => r.maxzoom)) + 2 : 18;
const map = new MapLibreMap({
  container: "map",
  style: style(),
  bounds: unionBbox(config.regions),
  fitBoundsOptions: { padding: 24 },
  maxZoom,
  attributionControl: { compact: true },
  hash: true,
});
map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

// The map follows the UI theme. Markers are DOM, so they survive the swap;
// the accuracy circle is a layer and is re-added on style.load.
window.addEventListener("outpost:theme", () => {
  map.setStyle(style(), { diff: false });
});
map.on("style.load", addAccuracyLayer);

// Cache badge: what works offline.
const cache = $("cache");
if (config.regions.length) {
  const names = config.regions.map((r) => r.label || r.name);
  const shown = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  cache.classList.add("badge-ok");
  cache.append(icon("ok"), el("span", "map-badge-text", `Tiles cached · ${shown}`));
  cache.title = `Offline tiles: ${names.join(", ")}`;
} else {
  cache.classList.add("badge-cau");
  cache.append(icon("caution"), el("span", "map-badge-text", "No offline tiles"));
}

// ------------------------------------------------------------- controls

$("panel-toggle").append(icon("list"));
$("zoom-in").append(icon("plus"));
$("zoom-out").append(icon("minus"));
$("north").append(icon("compass"));
$("fit").append(icon("fit"));
$("locate").append(icon("locate"));
$("panel-close").append(icon("close"));

$("zoom-in").addEventListener("click", () => map.zoomIn());
$("zoom-out").addEventListener("click", () => map.zoomOut());
$("north").addEventListener("click", () => map.resetNorthPitch());
// the compass needle points north (outpost.css .map-compass)
map.on("rotate", () => $("north").style.setProperty("--map-bearing", `${-map.getBearing()}deg`));
$("fit").addEventListener("click", fitNodes);
$("panel-toggle").addEventListener("click", () => setPanel(!panelOpen));
$("panel-close").addEventListener("click", () => {
  setPanel(false);
  $("panel-toggle").focus();
});
$("locate").addEventListener("click", locate);

function setPanel(open: boolean): void {
  panelOpen = open;
  const toggle = $("panel-toggle");
  $("panel").hidden = !open;
  $("stage").classList.toggle("is-open", open);
  toggle.setAttribute("aria-pressed", String(open));
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Hide node list" : "Show node list");
  map.resize();
}
WIDE.addEventListener("change", () => setPanel(WIDE.matches));
setPanel(panelOpen);

// ------------------------------------------------------- browser location

function locate(): void {
  if (watchId != null) {
    // already tracking: recentre
    if (me) map.easeTo({ center: [me.lng, me.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
    return;
  }
  if (!("geolocation" in navigator) || !window.isSecureContext) {
    locateError =
      "This browser only shares its position with pages on HTTPS or localhost; this page is plain HTTP on the local network. Node positions still work.";
    renderNotices();
    return;
  }
  followOnFix = true;
  $("locate").setAttribute("aria-pressed", "true");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      me = { lng: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy };
      locateError = null;
      if (followOnFix) {
        followOnFix = false;
        map.easeTo({ center: [me.lng, me.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
      }
      renderMe();
      renderMarkers();
      renderNotices();
      renderStrip();
    },
    (err) => {
      locateError =
        err.code === err.PERMISSION_DENIED
          ? "Location access was denied. Allow it for this page in the browser settings to show your position."
          : "No position fix from this device yet. Try again outside or near a window.";
      stopLocate();
      renderNotices();
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
  );
}

function stopLocate(): void {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  me = null;
  $("locate").setAttribute("aria-pressed", "false");
  renderMe();
  renderMarkers();
  renderStrip();
}

let meMarker: Marker | null = null;

function renderMe(): void {
  const source = map.getSource("me-accuracy") as GeoJSONSource | undefined;
  source?.setData(accuracyGeoJSON());
  if (!me) {
    meMarker?.remove();
    meMarker = null;
    return;
  }
  if (!meMarker) {
    const m = markerElement("div");
    m.classList.add("mk-own");
    m.setAttribute("role", "img");
    m.setAttribute("aria-label", "Your position");
    m.querySelector(".mk-label")!.textContent = "You";
    meMarker = new Marker({ element: m, anchor: "top", offset: [0, -9] }).setLngLat([me.lng, me.lat]).addTo(map);
  } else {
    meMarker.setLngLat([me.lng, me.lat]);
  }
}

/** Accuracy circle as a 48-point polygon (metres to degrees, fine at this scale). */
function accuracyGeoJSON(): GeoJSONSourceSpecification["data"] {
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

function addAccuracyLayer(): void {
  if (map.getSource("me-accuracy")) return;
  map.addSource("me-accuracy", { type: "geojson", data: accuracyGeoJSON() });
  map.addLayer({
    id: "me-accuracy-fill",
    type: "fill",
    source: "me-accuracy",
    paint: { "fill-color": token("--acc"), "fill-opacity": 0.12 },
  });
  map.addLayer({
    id: "me-accuracy-line",
    type: "line",
    source: "me-accuracy",
    paint: { "line-color": token("--acc"), "line-width": 1.5 },
  });
}

// ----------------------------------------------------------------- nodes

const AGE_LED: Record<Age, string> = { fresh: "led-ok", old: "led-cau", stale: "led-off" };
const AGE_WORD: Record<Age, string> = { fresh: "Fresh", old: "Old", stale: "Stale" };

function positioned(): Positioned[] {
  return [...nodes.values()]
    .filter(hasPosition)
    .sort((a, b) => Number(b.num === myNum) - Number(a.num === myNum) || (b.last_heard ?? 0) - (a.last_heard ?? 0));
}

const hops = (n: MeshNode) => (n.hops_away == null ? null : n.hops_away === 0 ? "direct" : `${n.hops_away} hop${n.hops_away === 1 ? "" : "s"}`);

/** "HEARD 3 MIN AGO · 2 HOPS" (or "THIS PI · !abcd1234" for the base). */
function metaLine(n: MeshNode): string {
  if (n.num === myNum) return `This Pi · ${nodeId(n)}`;
  return [`Heard ${ago(n.last_heard, now)}`, hops(n)].filter(Boolean).join(" · ");
}

const popup = new Popup({ offset: 14, maxWidth: "300px", focusAfterOpen: false });
popup.on("close", () => {
  if (selected == null) return;
  selected = null;
  render();
});

function popupContent(n: Positioned): HTMLElement {
  const isMe = n.num === myNum;
  const age = nodeAge(n, now);
  const root = el("div", "map-popup");
  const head = el("div", "map-popup-head");
  head.append(el("strong", "map-popup-title", nodeName(n)), el("span", "label", isMe ? `${nodeId(n)} · this Pi` : nodeId(n)));
  root.append(head);

  const dl = el("dl", "kv");
  const add = (key: string, value: string | Node | null) => {
    if (value == null) return;
    const dd = el("dd");
    dd.append(value);
    dl.append(el("dt", "", key), dd);
  };
  if (!isMe) {
    const status = el("span", "status");
    status.append(el("span", `led ${AGE_LED[age]}`), el("span", "", `${AGE_WORD[age]} · ${ago(n.last_heard, now)}`));
    add("Status", status);
    add("Heard", n.last_heard ? utcDateTime(n.last_heard * 1000) : "Never");
    add("Hops", hops(n)?.toUpperCase() ?? null);
    add("SNR", n.snr == null ? null : `${n.snr} dB`);
  }
  add(
    "Battery",
    n.battery == null ? null : n.battery > 100 ? "PLUGGED IN" : `${n.battery}%${n.voltage ? ` · ${n.voltage} V` : ""}`,
  );
  add("Alt", n.altitude == null ? null : `${n.altitude} m`);
  add("Pos", coords(n.latitude, n.longitude));
  add("HW", n.hw_model ? n.hw_model.replaceAll("_", " ") : null);
  root.append(dl);

  if (meshUrl) {
    const a = el("a", "btn btn-block", isMe ? "Open Mesh" : "Message in Mesh");
    a.href = `${meshUrl}/#nodes`;
    a.target = "_blank";
    a.rel = "noopener";
    a.prepend(icon("message", "i-sm"));
    root.append(a);
  }
  return root;
}

function markerElement<K extends "button" | "div">(tag: K): HTMLElementTagNameMap[K] {
  const m = el(tag, "mk");
  m.append(el("span", "mk-shape"), el("span", "mk-label"));
  return m;
}

/**
 * Node markers: a round `.mk-node` coloured by age (fresh ok, old cau, stale
 * faded grey), age written in the label for old/stale. The Pi's own node is
 * the amber own-position marker while the browser shows no position of its
 * own, and a square info marker labelled BASE once it does.
 */
function renderMarkers(): void {
  const seen = new Set<number>();
  for (const n of positioned()) {
    seen.add(n.num);
    let marker = markers.get(n.num);
    if (!marker) {
      const b = markerElement("button");
      b.type = "button";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        select(n.num, false);
      });
      marker = new Marker({ element: b, anchor: "top" }).setLngLat([n.longitude, n.latitude]).addTo(map);
      markers.set(n.num, marker);
    } else {
      const at = marker.getLngLat();
      if (at.lng !== n.longitude || at.lat !== n.latitude) marker.setLngLat([n.longitude, n.latitude]);
    }
    const isMe = n.num === myNum;
    const own = isMe && !me;
    const age = nodeAge(n, now);
    const b = marker.getElement();
    b.classList.toggle("mk-own", own);
    b.classList.toggle("mk-node", !isMe);
    for (const a of ["fresh", "old", "stale"] as const) b.classList.toggle(`is-${a}`, !isMe && a === age);
    b.setAttribute("aria-pressed", String(selected === n.num));
    marker.setOffset([0, own ? -9 : -8]);

    const short = nodeBadge(n);
    const label = isMe ? `${short} · Base` : age === "fresh" ? short : `${short} · ${ago(n.last_heard, now).replace(/ AGO$/, "")}`;
    b.querySelector(".mk-label")!.textContent = label;
    const spoken = isMe
      ? `${nodeName(n)}, this Pi (base station)`
      : `${nodeName(n)}, ${AGE_WORD[age].toLowerCase()}, heard ${ago(n.last_heard, now).toLowerCase()}`;
    b.setAttribute("aria-label", spoken);
    b.title = spoken;
  }
  for (const [num, marker] of markers) {
    if (seen.has(num)) continue;
    marker.remove();
    markers.delete(num);
  }
  if (selected != null) {
    const n = nodes.get(selected);
    if (n && hasPosition(n)) popup.setLngLat([n.longitude, n.latitude]).setDOMContent(popupContent(n));
  }
}

function renderList(): void {
  const rows = positioned();
  $("node-list").replaceChildren(
    ...rows.map((n) => {
      const isMe = n.num === myNum;
      const age = nodeAge(n, now);
      const li = el("li");
      const row = el("button", "row has-mono");
      row.type = "button";
      if (selected === n.num) row.setAttribute("aria-current", "true");
      row.addEventListener("click", () => select(n.num, true));
      const main = el("span", "row-main");
      main.append(el("span", "row-title", nodeName(n)), el("span", "row-meta", metaLine(n)));
      const value = el("span", "row-value status");
      value.append(el("span", `led ${isMe ? "led-info" : AGE_LED[age]}`), el("span", "", isMe ? "BASE" : AGE_WORD[age].toUpperCase()));
      row.append(el("span", "monogram", nodeBadge(n).slice(0, 4)), main, value, icon("chevron", "i-sm"));
      li.append(row);
      return li;
    }),
  );

  const without = nodes.size - rows.length;
  const empty = $("nodes-empty");
  let emptyState: [string, string, string] | null = null;
  if (!rows.length) {
    if (meshState === "off") emptyState = ["offline", "Mesh is not installed", "Add the Mesh module with ./install.sh to see nodes here."];
    else if (meshState === "connecting") emptyState = ["mesh", "Connecting", "Reading the node list from the Mesh app."];
    else if (meshState === "unreachable") emptyState = ["offline", "No node data", "The Mesh app is not answering. Nodes appear once it is reachable."];
    else if (nodes.size)
      emptyState = ["waypoint", "No positions yet", "Nodes appear here once their owners share a position."];
    else emptyState = ["mesh", "No nodes heard", "Nodes appear here as the radio hears them."];
  }
  empty.hidden = !emptyState;
  if (emptyState) {
    const [ic, title, body] = emptyState;
    empty.replaceChildren(icon(ic), el("p", "empty-title", title), el("p", "", body));
  }
  $<HTMLButtonElement>("fit").disabled = rows.length === 0;
  $("summary").textContent = nodes.size
    ? `${rows.length} on map${without > 0 ? ` · ${without} without position` : ""}`
    : meshState === "live"
      ? "0 heard"
      : "";
}

function renderStrip(): void {
  const link: Record<MeshState | "off", [LinkState, string]> = {
    live: ["ok", "Mesh · live"],
    connecting: ["cau", "Mesh · connecting"],
    unreachable: ["crit", meshReason === "blocked" ? "Mesh · access blocked" : "Mesh · no answer"],
    off: ["cau", "Mesh · off"],
  };
  const [state, label] = link[meshState];
  strip?.setLink(state, label.toUpperCase());
  const items: StripItem[] = [];
  if (meshState !== "off") items.push({ label: "NODES", value: String(nodes.size) });
  if (me) items.push({ label: "GNSS", value: `±${Math.round(me.accuracy)} M` });
  strip?.setItems(items);
}

function banner(kind: "info" | "cau", iconName: string, title: string, body: string, onClose?: () => void): HTMLElement {
  const b = el("div", `banner banner-${kind}`);
  const text = el("div", "banner-text");
  text.append(el("span", "banner-title", title), el("span", "banner-body", body));
  b.append(icon(iconName), text);
  if (onClose) {
    const close = el("button", "btn btn-icon btn-ghost");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.title = "Dismiss";
    close.append(icon("close"));
    close.addEventListener("click", onClose);
    b.append(close);
  }
  return b;
}

function renderNotices(): void {
  const list: HTMLElement[] = [];
  if (meshState === "unreachable") {
    const stale = nodes.size ? " Showing positions as last loaded, with their age." : "";
    list.push(
      meshReason === "blocked"
        ? banner("cau", "caution", "Mesh did not send the node list", `Retrying automatically.${stale}`)
        : banner(
            "cau",
            "caution",
            "Mesh is not running",
            `Start the Mesh module on the home page; this map reconnects automatically.${stale}`,
          ),
    );
  } else if (meshState === "off") {
    list.push(banner("info", "info", "Mesh is not installed", "Add the Mesh module with ./install.sh to see nodes here."));
  }
  if (!config.regions.length) {
    list.push(
      banner(
        "info",
        "info",
        "No offline map",
        "Download a region in the Maps app; it shows up here after a reload. Nodes are still placed on the blank map.",
      ),
    );
  }
  if (locateError) {
    list.push(
      banner("cau", "caution", "Position unavailable", locateError, () => {
        locateError = null;
        renderNotices();
      }),
    );
  }
  const box = $("notices");
  box.hidden = !list.length;
  box.replaceChildren(...list);
  map.resize();
}

function render(): void {
  renderMarkers();
  renderList();
  renderStrip();
}

function select(num: number, fly: boolean): void {
  const n = nodes.get(num);
  if (!n || !hasPosition(n)) return;
  selected = num;
  if (fly) map.easeTo({ center: [n.longitude, n.latitude], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 400 });
  // the phone sheet covers the map: close it so the popup is visible
  if (!WIDE.matches && panelOpen) setPanel(false);
  popup.setLngLat([n.longitude, n.latitude]).setDOMContent(popupContent(n));
  if (!popup.isOpen()) popup.addTo(map);
  render();
}

function fitNodes(): void {
  const rows = positioned();
  if (!rows.length) return;
  const bounds = new LngLatBounds();
  for (const n of rows) bounds.extend([n.longitude, n.latitude]);
  map.fitBounds(bounds, { padding: 60, maxZoom: FOCUS_ZOOM, duration: 400 });
}

function afterNodes(): void {
  render();
  if (linkedNode) {
    const n = positioned().find((x) => nodeId(x) === linkedNode);
    if (n) {
      linkedNode = null;
      select(n.num, true);
      // drop the parameter so a reload doesn't jump back; keep the camera hash
      history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
    }
  } else if (!framed && positioned().length) {
    framed = true;
    fitNodes();
  }
}

// --------------------------------------------------------------- wiring

if (meshUrl) {
  map.once("load", () => {
    connectMesh(meshUrl, {
      onNodes: (next) => {
        nodes = next;
        afterNodes();
      },
      onMyNum: (num) => {
        myNum = num;
        render();
      },
      onState: (state, reason) => {
        meshState = state;
        meshReason = reason;
        renderNotices();
        renderList();
        renderStrip();
      },
    });
  });
} else {
  meshState = "off";
}
renderNotices();
render();

// keep "heard 5 min ago" and the ages current; skip while the page is hidden
let visible = document.visibilityState === "visible";
onVisibility((v) => {
  visible = v;
  if (v) {
    now = Date.now() / 1000;
    render();
  }
});
window.setInterval(() => {
  if (!visible) return;
  now = Date.now() / 1000;
  render();
}, 60_000);
