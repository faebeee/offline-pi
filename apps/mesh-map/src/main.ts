import {
  addProtocol,
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import {
  ago,
  connectMesh,
  hasPosition,
  nodeAge,
  nodeBadge,
  nodeId,
  nodeName,
  type MeshNode,
  type MeshState,
} from "./mesh";
import { buildStyle, THEMES, unionBbox, type Region, type Theme } from "./style";
import "./styles.css";

type Config = { meshPort: number | null; regions: Region[] };

const THEME_KEY = "mesh-map:theme";
const FOCUS_ZOOM = 13;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode etc.; the setting just isn't remembered
  }
}

// ------------------------------------------------------------------ state

let nodes = new Map<number, MeshNode>();
let myNum: number | null = null;
let meshState: MeshState | "off" = "connecting";
let now = Date.now() / 1000;
const markers = new Map<number, Marker>();
// `?node=!abcd1234` from apps/mesh's "Show on map": open it once it loads.
let linkedNode = new URLSearchParams(location.search).get("node");
// Frame the nodes on first load unless the URL already has a camera.
let framed = /^#\d/.test(location.hash) || linkedNode != null;

const config = await fetch("/api/config")
  .then((r) => r.json() as Promise<Config>)
  .catch((): Config => ({ meshPort: null, regions: [] }));
const meshUrl = config.meshPort ? `${location.protocol}//${location.hostname}:${config.meshPort}` : null;

// ------------------------------------------------------------------- map

const protocol = new Protocol();
addProtocol("pmtiles", protocol.tile);

let theme: Theme = (THEMES as readonly string[]).includes(readStored(THEME_KEY) ?? "")
  ? (readStored(THEME_KEY) as Theme)
  : "light";

const maxZoom = config.regions.length ? Math.max(...config.regions.map((r) => r.maxzoom)) + 2 : 18;
const map = new MapLibreMap({
  container: "map",
  style: buildStyle(config.regions, theme, location.origin),
  bounds: unionBbox(config.regions),
  fitBoundsOptions: { padding: 24 },
  maxZoom,
  attributionControl: { compact: true },
  hash: true,
});
map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
map.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-right");
map.addControl(new GeolocateControl({ trackUserLocation: true }), "top-right");

const themeSelect = $<HTMLSelectElement>("theme");
for (const t of THEMES) themeSelect.append(new Option(t, t, false, t === theme));
themeSelect.addEventListener("change", () => {
  theme = themeSelect.value as Theme;
  writeStored(THEME_KEY, theme);
  // markers are DOM elements, so they survive the style swap
  map.setStyle(buildStyle(config.regions, theme, location.origin));
});


// ----------------------------------------------------------------- nodes

function positioned(): (MeshNode & { latitude: number; longitude: number })[] {
  return [...nodes.values()].filter(hasPosition).sort((a, b) => (b.last_heard ?? 0) - (a.last_heard ?? 0));
}

function popupContent(n: MeshNode): HTMLElement {
  const isMe = n.num === myNum;
  const root = document.createElement("div");
  root.className = "popup";
  const title = document.createElement("strong");
  title.textContent = nodeName(n);
  const sub = document.createElement("div");
  sub.className = "muted small";
  sub.textContent = isMe ? `${nodeId(n)} · this Pi` : nodeId(n);
  root.append(title, sub);

  const rows: [string, string | null][] = [
    ["Heard", isMe ? null : ago(n.last_heard, now)],
    ["Hops", isMe || n.hops_away == null ? null : n.hops_away === 0 ? "direct" : String(n.hops_away)],
    ["SNR", isMe || n.snr == null ? null : `${n.snr} dB`],
    [
      "Battery",
      n.battery == null ? null : n.battery > 100 ? "plugged in" : `${n.battery} %${n.voltage ? ` (${n.voltage} V)` : ""}`,
    ],
    ["Altitude", n.altitude == null ? null : `${n.altitude} m`],
    ["Position", `${n.latitude?.toFixed(5)}, ${n.longitude?.toFixed(5)}`],
    ["Hardware", n.hw_model ? n.hw_model.replaceAll("_", " ") : null],
  ];
  const dl = document.createElement("dl");
  for (const [key, value] of rows) {
    if (value == null) continue;
    const dt = document.createElement("dt");
    dt.textContent = key;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  root.append(dl);

  if (meshUrl) {
    const a = document.createElement("a");
    a.href = `${meshUrl}/#nodes`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = isMe ? "Open Mesh" : "Message in Mesh";
    root.append(a);
  }
  return root;
}

/** Diff the markers against the node list; markers are read-only DOM badges. */
function renderMarkers(): void {
  const seen = new Set<number>();
  for (const n of positioned()) {
    seen.add(n.num);
    let marker = markers.get(n.num);
    if (!marker) {
      const el = document.createElement("button");
      el.type = "button";
      marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([n.longitude, n.latitude])
        .setPopup(new Popup({ offset: 16, maxWidth: "260px" }))
        .addTo(map);
      markers.set(n.num, marker);
    } else {
      const at = marker.getLngLat();
      if (at.lng !== n.longitude || at.lat !== n.latitude) marker.setLngLat([n.longitude, n.latitude]);
    }
    const isMe = n.num === myNum;
    const label = `${nodeName(n)}${isMe ? " (this Pi)" : ""}, heard ${ago(n.last_heard, now)}`;
    const el = marker.getElement();
    el.className = `node-marker ${nodeAge(n, now)}${isMe ? " me" : ""}`;
    el.textContent = nodeBadge(n);
    el.title = label;
    el.setAttribute("aria-label", `Node ${label}`);
    marker.getPopup()?.setDOMContent(popupContent(n));
  }
  for (const [num, marker] of markers) {
    if (seen.has(num)) continue;
    marker.remove();
    markers.delete(num);
  }
}

function renderList(): void {
  const list = $("node-list");
  const rows = positioned();
  list.replaceChildren(
    ...rows.map((n) => {
      const isMe = n.num === myNum;
      const li = document.createElement("li");
      li.className = `node ${nodeAge(n, now)}`;
      const button = document.createElement("button");
      button.type = "button";
      button.addEventListener("click", () => focusNode(n.num));
      const badge = document.createElement("span");
      badge.className = `badge${isMe ? " me" : ""}`;
      badge.textContent = nodeBadge(n);
      const text = document.createElement("span");
      text.className = "node-text";
      const name = document.createElement("span");
      name.className = "node-name";
      name.textContent = isMe ? `${nodeName(n)} · this Pi` : nodeName(n);
      const sub = document.createElement("span");
      sub.className = "muted small";
      sub.textContent = isMe ? nodeId(n) : `heard ${ago(n.last_heard, now)}`;
      text.append(name, sub);
      button.append(badge, text);
      li.append(button);
      return li;
    }),
  );

  const without = nodes.size - rows.length;
  const empty = $("nodes-empty");
  empty.hidden = rows.length > 0 || meshState !== "live";
  empty.textContent = nodes.size
    ? "No node has shared a position yet. Nodes appear once their owners enable position sharing."
    : "No nodes heard yet.";
  $("fit").hidden = rows.length < 2;
  $("summary").textContent =
    meshState === "live"
      ? `${rows.length} on the map${without > 0 ? `, ${without} without position` : ""}`
      : "";
}

function renderState(): void {
  const pill = $("mesh-state");
  pill.className = `pill ${meshState}`;
  pill.textContent = { off: "off", connecting: "connecting…", live: "live", unreachable: "offline" }[meshState];
  const messages: string[] = [];
  if (meshState === "unreachable") {
    messages.push(
      `Can't read nodes from the Mesh app on port ${config.meshPort}. Is apps/mesh running, with MESH_MAP_PORT set to this app's port (${location.port || "80"})?`,
    );
  } else if (meshState === "off") {
    messages.push("MESH_PORT is off in .env, so no nodes are shown.");
  }
  if (!config.regions.length) {
    messages.push(
      "No offline map found. Download a region in the Maps app (apps/maps); it shows up here after a reload. Nodes are still placed on the blank map.",
    );
  }
  const notice = $("notice");
  notice.hidden = !messages.length;
  notice.replaceChildren(...messages.map((m) => Object.assign(document.createElement("p"), { textContent: m })));
  const link = $<HTMLAnchorElement>("mesh-link");
  link.hidden = !meshUrl;
  if (meshUrl) link.href = meshUrl;
}

function render(): void {
  renderMarkers();
  renderList();
}

function focusNode(num: number): void {
  const marker = markers.get(num);
  if (!marker) return;
  map.easeTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 600 });
  if (!marker.getPopup()?.isOpen()) marker.togglePopup();
}

function fitNodes(): void {
  const rows = positioned();
  if (!rows.length) return;
  const bounds = new LngLatBounds();
  for (const n of rows) bounds.extend([n.longitude, n.latitude]);
  map.fitBounds(bounds, { padding: 60, maxZoom: FOCUS_ZOOM, duration: 600 });
}
$("fit").addEventListener("click", fitNodes);

function afterNodes(): void {
  render();
  if (linkedNode) {
    const n = positioned().find((x) => nodeId(x) === linkedNode);
    if (n) {
      linkedNode = null;
      focusNode(n.num);
      // drop the parameter so a reload doesn't jump back; keep the camera hash
      history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
    }
  } else if (!framed && positioned().length) {
    framed = true;
    fitNodes();
  }
}

// --------------------------------------------------------------- wiring

if (config.meshPort) {
  map.once("load", () => {
    connectMesh(config.meshPort as number, {
      onNodes: (next) => {
        nodes = next;
        afterNodes();
      },
      onMyNum: (num) => {
        myNum = num;
        render();
      },
      onState: (state) => {
        meshState = state;
        renderState();
        renderList();
      },
    });
  });
} else {
  meshState = "off";
}
renderState();
renderList();

// keep "heard 5 min ago" and the fading current
window.setInterval(() => {
  now = Date.now() / 1000;
  render();
}, 60_000);
