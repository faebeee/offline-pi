// outpost.js: shared behaviour for every Outpost app (DESIGN.md). No
// dependencies, no network. Import it as an ES module next to outpost.css:
//
//   import { initTheme, frame, icon } from "/ui/outpost.js";
//
// Everything here works on plain DOM, so React and vanilla apps share it.

const THEME_KEY = "outpost.theme";
let SPRITE = new URL("./icons.svg", import.meta.url).href;
const SVG_NS = "http://www.w3.org/2000/svg";

// ------------------------------------------------------------------ icons --

/** An <svg class="i"> using the sprite. Decorative (aria-hidden) by default. */
export function icon(name, className = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", `i ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `${SPRITE}#${name}`);
  svg.append(use);
  return svg;
}

/** Same as icon(), as an HTML string (for templates and frameworks). */
export function iconHtml(name, className = "") {
  return `<svg class="i ${className}" aria-hidden="true" focusable="false"><use href="${SPRITE}#${name}"/></svg>`;
}

export const iconHref = (name) => `${SPRITE}#${name}`;

/**
 * Point icons at another sprite. Pass "" when the sprite is inlined in the
 * page (single-file pages), so icons reference `#name` directly.
 */
export function setSprite(url) {
  SPRITE = url;
}

/** Status shapes are fixed (DESIGN.md section 5). */
export const STATUS = {
  info: { icon: "info", cls: "info" },
  ok: { icon: "ok", cls: "ok" },
  cau: { icon: "caution", cls: "cau" },
  crit: { icon: "critical", cls: "crit" },
  off: { icon: "offline", cls: "off" },
};

/** badge() as an HTML string; `text` is escaped. */
export function badgeHtml(state, text, className = "") {
  const s = STATUS[state] ?? STATUS.off;
  const cls = `badge ${state === "off" ? "" : `badge-${s.cls}`} ${className}`.trim();
  return `<span class="${cls}">${iconHtml(s.icon)}${escapeHtml(text)}</span>`;
}

/** Escape text for HTML templates. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** A status badge: colour + shape + written label. */
export function badge(state, text, className = "") {
  const s = STATUS[state] ?? STATUS.off;
  const el = document.createElement("span");
  el.className = `badge ${state === "off" ? "" : `badge-${s.cls}`} ${className}`.trim();
  el.append(icon(s.icon), document.createTextNode(text));
  return el;
}

// ------------------------------------------------------------------ theme --

/**
 * The themes, in picker order. `mode` is the light/dark family: <html> gets
 * `t-<mode>` (color-scheme, map style, everything keyed on .t-dark) and,
 * for the neon themes, `t-<id>` on top, which redefines the colour tokens.
 */
export const THEMES = [
  { id: "dark", label: "Outpost", mode: "dark", hint: "Amber on night green" },
  { id: "light", label: "Daylight", mode: "light", hint: "For bright sun" },
  { id: "neon", label: "Neon", mode: "dark", hint: "Magenta on violet" },
  { id: "netrun", label: "Netrunner", mode: "dark", hint: "Cyan on deep blue" },
  { id: "toxic", label: "Toxic", mode: "dark", hint: "Acid lime on black" },
];

const THEME_CLASSES = THEMES.map((t) => `t-${t.id}`);

function themeInfo(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

function readTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (THEMES.some((t) => t.id === v)) return v;
  } catch {
    // storage blocked: fall through
  }
  return null;
}

/** The current theme id ("dark", "light", "neon", ...). */
export function getTheme() {
  const classes = document.documentElement.classList;
  const neon = THEMES.find((t) => t.id !== t.mode && classes.contains(`t-${t.id}`));
  if (neon) return neon.id;
  return classes.contains("t-light") ? "light" : "dark";
}

/** "dark" or "light": the family of the current theme. */
export function getThemeMode() {
  return themeInfo(getTheme()).mode;
}

/**
 * Apply the theme class on <html>. Stored choice first, else dark (the
 * default). Call before first paint (top of the module) to avoid a flash.
 */
export function initTheme() {
  applyTheme(readTheme() ?? "dark", false);
  return getTheme();
}

/** Switch theme, persist it, fire `outpost:theme` on window ({detail: id}). */
export function applyTheme(theme, persist = true) {
  const t = themeInfo(theme);
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASSES);
  root.classList.add(`t-${t.mode}`);
  if (t.id !== t.mode) root.classList.add(`t-${t.id}`);
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, t.id);
    } catch {
      // not remembered, still applied
    }
  }
  window.dispatchEvent(new CustomEvent("outpost:theme", { detail: t.id }));
}

/**
 * Wire a 44 px .btn-icon as a theme button for pages without the picker:
 * each press moves to the next theme (moon in dark themes, sun in light).
 */
export function themeToggle(button) {
  const render = () => {
    const current = themeInfo(getTheme());
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    button.replaceChildren(icon(current.mode === "dark" ? "moon" : "sun"));
    button.setAttribute("aria-label", `Theme: ${current.label}. Switch to ${next.label}`);
    button.title = button.getAttribute("aria-label");
  };
  button.classList.add("btn", "btn-icon");
  button.type = "button";
  button.addEventListener("click", () => {
    const current = themeInfo(getTheme());
    applyTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length].id);
  });
  window.addEventListener("outpost:theme", render);
  render();
  return button;
}

// ---------------------------------------------------------------- modules --

/**
 * The suite's modules. Everything is served by core on one port, each module
 * under its own path, so links are plain paths and work on the hotspot, LAN
 * or localhost alike. This list is the fallback; frame() replaces it with
 * core's /api/modules (installed modules only, from the module manifests),
 * so a new module shows up in every nav without touching this file.
 */
export const MODULES = [
  { id: "home", num: 0, label: "Home", icon: "hub", path: "/" },
  { id: "maps", num: 1, label: "Maps", icon: "map", path: "/maps/" },
  { id: "mesh", num: 2, label: "Mesh", icon: "mesh", path: "/mesh/" },
  { id: "knowledge", num: 3, label: "Library", icon: "library", path: "/library/" },
  { id: "system", num: 4, label: "System", icon: "system", path: "/system/" },
];

/** Header label for a module: "Module 02 · Mesh". */
export function moduleLabel(id) {
  const m = MODULES.find((x) => x.id === id);
  if (!m) return "";
  return m.num ? `Module ${String(m.num).padStart(2, "0")} · ${m.label}` : m.label;
}

/** Link to a module (same host and port as the current page). */
export function moduleUrl(id, path = "") {
  const m = MODULES.find((x) => x.id === id);
  if (!m) return null;
  return m.path + path.replace(/^\//, "");
}

/** Fill <nav class="nav" aria-label="Modules"> with the module links. */
export function renderNav(nav, current) {
  nav.classList.add("nav");
  nav.setAttribute("aria-label", "Modules");
  nav.replaceChildren(
    ...MODULES.map((m) => {
      const a = document.createElement("a");
      a.className = "nav-item";
      a.href = m.path;
      if (m.id === current) a.setAttribute("aria-current", "page");
      if (m.running === false) a.classList.add("is-off");
      const label = document.createElement("span");
      label.textContent = m.label;
      a.append(icon(m.icon), label);
      return a;
    }),
  );
  return nav;
}

/**
 * Load the installed modules from core (/api/modules) into MODULES. Resolves
 * to false when core isn't reachable (MODULES keeps the fallback list).
 */
export async function loadModules() {
  try {
    const res = await fetch("/api/modules", { headers: { Accept: "application/json" } });
    if (!res.ok) return false;
    const data = await res.json();
    const list = data.modules
      .filter((m) => m.installed)
      .map((m) => ({
        id: m.id, num: m.num, label: m.label, icon: m.icon, path: m.path,
        running: m.optional ? m.state === "running" : true,
      }));
    MODULES.splice(0, MODULES.length, MODULES[0], ...list);
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------- status strip --

/**
 * Status strip: link LED + text on the left, items and UTC clock on the
 * right. The link is the app's link to its own local data source, written
 * "<SOURCE> · <STATE>": "ok" = connected/loaded ("LOCAL · 3 REGIONS",
 * "RADIO · LINKED"), "cau" = connecting/reconnecting/stale
 * ("LOCAL · CONNECTING"), "crit" = failed, with a short reason
 * ("LOCAL · NO ANSWER"). Items: [{ label: "BAT", value: "78%" }]; items
 * without a data source are left out rather than faked.
 */
export function statusStrip(el) {
  el.classList.add("strip");
  el.setAttribute("role", "status");
  const link = document.createElement("span");
  link.className = "strip-link";
  const led = document.createElement("span");
  const text = document.createElement("span");
  link.append(led, text);
  // host metrics (the same on every screen): whole items only, the ones
  // that don't fit wrap onto a hidden second line
  const host = document.createElement("span");
  host.className = "strip-host";
  const items = document.createElement("span");
  items.className = "strip-items";
  const clock = document.createElement("span");
  clock.className = "strip-item";
  el.replaceChildren(link, host, items);

  let extra = [];
  const tick = () => {
    clock.textContent = utcTime(new Date());
  };
  const item = ({ label, value, tone }) => {
    const s = document.createElement("span");
    s.className = tone === "cau" || tone === "crit" ? `strip-item is-${tone}` : "strip-item";
    const b = document.createElement("b");
    b.textContent = value;
    s.append(`${label} `, b);
    return s;
  };
  const renderItems = () => {
    items.replaceChildren(...extra.map(item), clock);
  };

  const api = {
    setLink(state, label) {
      led.className = `led led-sq led-${state === "ok" ? "ok" : state === "crit" ? "crit" : "cau"}`;
      text.textContent = label;
    },
    setItems(list) {
      extra = list ?? [];
      renderItems();
    },
    setHost(list) {
      host.replaceChildren(...(list ?? []).map(item));
    },
  };
  api.setLink("cau", "LOCAL · CONNECTING");
  renderItems();
  tick();
  // align to the minute so the clock flips on time
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, 60_000 - (Date.now() % 60_000));
  return api;
}

// ------------------------------------------------------------------ frame --

/**
 * Wire the standard frame in one call: theme, status strip, module nav, the
 * theme toggle and the header's module label. Expects [data-strip],
 * [data-nav] and optionally [data-theme-toggle] and [data-module-label]
 * ("Module 02 · Mesh") inside `root` (default document). Call it once per
 * page: it binds listeners and starts the strip clock. The nav is drawn from
 * the built-in list right away and redrawn from core's /api/modules once
 * loaded (`modules` resolves to whether that worked).
 */
export function frame(current, root = document) {
  initTheme();
  const stripEl = root.querySelector("[data-strip]");
  const navEl = root.querySelector("[data-nav]");
  const toggle = root.querySelector("[data-theme-toggle]");
  const strip = stripEl ? statusStrip(stripEl) : null;
  const labels = () => {
    for (const el of root.querySelectorAll("[data-module-label]")) el.textContent = moduleLabel(current);
  };
  if (navEl) renderNav(navEl, current);
  if (toggle) themeToggle(toggle);
  labels();
  // then the real list from core: installed modules, running state
  const modules = loadModules().then((ok) => {
    if (ok && navEl) renderNav(navEl, current);
    if (ok) labels();
    return ok;
  });
  return { strip, modules };
}

// ------------------------------------------------------------- formatters --

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** "14:32Z" */
export function utcTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

/** "14:32:05Z" */
export function utcClock(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}Z`;
}

/** "2026-11-09 14:32Z" */
export function utcDateTime(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${utcTime(date)}`;
}

/** "2026-11-09" (UTC) */
export function utcDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** "47.37690 N · 008.54170 E" */
export function coords(lat, lon) {
  const ns = `${Math.abs(lat).toFixed(5)} ${lat < 0 ? "S" : "N"}`;
  const [li, lf] = Math.abs(lon).toFixed(5).split(".");
  return `${ns} · ${pad(li, 3)}.${lf} ${lon < 0 ? "W" : "E"}`;
}

/** Data age from unix seconds: "JUST NOW", "3 MIN AGO", "2 H AGO", "4 D AGO", "NEVER". */
export function ago(seconds, now = Date.now() / 1000) {
  if (!seconds) return "NEVER";
  const d = now - seconds;
  if (d < 60) return "JUST NOW";
  if (d < 3600) return `${Math.floor(d / 60)} MIN AGO`;
  if (d < 86400) return `${Math.floor(d / 3600)} H AGO`;
  return `${Math.floor(d / 86400)} D AGO`;
}

/** "1.4 GB" */
export function bytes(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Bearing as three digits: "038°" */
export const bearing = (deg) => `${pad(Math.round(((deg % 360) + 360) % 360), 3)}°`;

/** "850 m" / "12.4 km" */
export function distance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

// ------------------------------------------------------------ indicators --

function fillCells(el, count, lit, cls) {
  if (el.children.length !== count) {
    el.replaceChildren(...Array.from({ length: count }, () => document.createElement("i")));
  }
  [...el.children].forEach((c, i) => c.classList.toggle("on", i < lit));
  if (cls !== undefined) {
    el.classList.toggle("is-cau", cls === "cau");
    el.classList.toggle("is-crit", cls === "crit");
  }
}

/**
 * Segmented progress bar (.progress), ratio 0..1. `tone` "cau" / "crit"
 * lights it in that status colour (e.g. a nearly full disk).
 */
export function progress(el, ratio, cells = 32, tone) {
  el.classList.add("progress");
  el.setAttribute("role", "progressbar");
  el.setAttribute("aria-valuemin", "0");
  el.setAttribute("aria-valuemax", "100");
  el.setAttribute("aria-valuenow", String(Math.round(Math.max(0, Math.min(1, ratio)) * 100)));
  fillCells(el, cells, Math.round(Math.max(0, Math.min(1, ratio)) * cells), tone ?? "");
}

/** Power cells (.cells): 10 cells, cau at <=30 %, crit at <=10 %. */
export function powerCells(el, percent) {
  el.classList.add("cells");
  const p = Math.max(0, Math.min(100, percent));
  fillCells(el, 10, Math.round(p / 10), p <= 10 ? "crit" : p <= 30 ? "cau" : "");
}

/** Signal bars (.bars): level 0..5. */
export function signalBars(el, level) {
  el.classList.add("bars");
  fillCells(el, 5, Math.max(0, Math.min(5, Math.round(level))));
}

// ------------------------------------------------------------------ toast --

let toastHost = null;

/** Short confirmation, auto-dismissed after 5 s. Never for critical info. */
export function toast(message, { action, onAction, timeout = 5000 } = {}) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toasts";
    toastHost.setAttribute("aria-live", "polite");
    document.body.append(toastHost);
  }
  const t = document.createElement("div");
  t.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  t.append(icon("ok"), text);
  const close = () => t.remove();
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-sm";
    b.textContent = action;
    b.addEventListener("click", () => {
      onAction?.();
      close();
    });
    t.append(b);
  }
  toastHost.append(t);
  setTimeout(close, timeout);
  return close;
}

// -------------------------------------------------------- hold to confirm --

/**
 * Hold-to-confirm on a .btn.hold: pointer or Space/Enter held for
 * `duration` ms calls onConfirm; releasing early cancels. Shows elapsed time.
 * Returns a function that unbinds it.
 */
export function holdToConfirm(button, onConfirm, { duration = 3000, label } = {}) {
  button.classList.add("btn", "hold");
  const text = label ?? button.textContent.trim();
  const fill = document.createElement("span");
  fill.className = "hold-fill";
  const name = document.createElement("span");
  name.textContent = text;
  const time = document.createElement("span");
  time.className = "hold-time";
  button.replaceChildren(fill, icon("critical"), name, time);
  button.setAttribute("aria-label", `${text}, hold to confirm`);

  let start = 0;
  let raf = 0;
  const total = (duration / 1000).toFixed(1);
  const reset = () => {
    cancelAnimationFrame(raf);
    start = 0;
    fill.style.width = "0";
    time.textContent = "";
  };
  const step = () => {
    const t = Date.now() - start;
    fill.style.width = `${Math.min(100, (t / duration) * 100)}%`;
    time.textContent = `${(t / 1000).toFixed(1)} / ${total} S`;
    if (t >= duration) {
      reset();
      onConfirm();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  const begin = (e) => {
    if (start || button.disabled) return;
    if (e.type === "keydown" && e.key !== " " && e.key !== "Enter") return;
    if (e.type === "keydown") {
      e.preventDefault();
      if (e.repeat) return;
    }
    start = Date.now();
    raf = requestAnimationFrame(step);
  };
  const end = (e) => {
    if (e.type === "keyup" && e.key !== " " && e.key !== "Enter") return;
    reset();
  };
  const block = (e) => e.preventDefault();
  const events = [
    ["pointerdown", begin],
    ["keydown", begin],
    ["pointerup", end],
    ["pointerleave", end],
    ["pointercancel", end],
    ["keyup", end],
    ["blur", end],
    ["click", block],
    ["contextmenu", block],
  ];
  for (const [ev, fn] of events) button.addEventListener(ev, fn);
  return () => {
    reset();
    for (const [ev, fn] of events) button.removeEventListener(ev, fn);
  };
}

// ---------------------------------------------------------------- visibility --

/**
 * Run `fn(visible)` when the page is hidden or shown, so apps can pause
 * polling and map rendering (DESIGN.md section 10).
 */
export function onVisibility(fn) {
  const handler = () => fn(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
