// Mesh web UI: conversations (channels + direct messages), nodes, composer.
// Talks to the FastAPI backend: REST for history, /api/live for push events.
"use strict";

const BROADCAST = 0xffffffff;
const $ = (id) => document.getElementById(id);

const state = {
  status: {},
  config: { max_text_bytes: 200, send_pin_required: false, maps_port: "", mesh_map_port: "" },
  nodes: new Map(), // num -> node row
  convs: new Map(), // conv -> { last_id, last_time }
  current: null, // conv key
  messages: [], // rows of the current conversation, oldest first
  view: "chats",
  ws: "connecting", // connecting | open | closed
};

// ------------------------------------------------------------ helpers

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json", ...(opts.headers || {}) }, ...opts });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error((body && body.detail && (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail))) || res.statusText);
    err.status = res.status;
    throw err;
  }
  return body;
}

const hex = (num) => "!" + (num >>> 0).toString(16).padStart(8, "0");
const nodeName = (num) => {
  const n = state.nodes.get(num);
  return (n && (n.long_name || n.short_name || n.node_id)) || hex(num);
};
const nodeShort = (num) => {
  const n = state.nodes.get(num);
  return (n && n.short_name) || hex(num).slice(-4);
};
const isMe = (num) => num === state.status.node_num;

function channelName(index) {
  const ch = (state.status.channels || []).find((c) => c.index === index);
  return ch ? ch.name : `Channel ${index}`;
}

function convTitle(conv) {
  const [kind, value] = conv.split(":");
  return kind === "ch" ? `# ${channelName(Number(value))}` : nodeName(Number(value));
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function ago(seconds) {
  if (!seconds) return "never";
  const d = Date.now() / 1000 - seconds;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} d ago`;
}

function distanceKm(a, b) {
  if (a?.latitude == null || b?.latitude == null) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// apps/mesh-map (all nodes, this one opened) if configured, else apps/maps
// centred on the position. The hash is the map camera in both.
function mapLink(n) {
  const camera = `#14/${n.latitude.toFixed(5)}/${n.longitude.toFixed(5)}`;
  const base = (port) => `${location.protocol}//${location.hostname}:${port}`;
  if (state.config.mesh_map_port) return `${base(state.config.mesh_map_port)}/?node=${encodeURIComponent(n.node_id || hex(n.num))}${camera}`;
  if (state.config.maps_port) return `${base(state.config.maps_port)}/${camera}`;
  return null;
}

const utf8Bytes = (s) => new TextEncoder().encode(s).length;

// ------------------------------------------------------------ unread tracking

const lastRead = () => JSON.parse(store("mesh.lastRead") || "{}");
function markRead(conv, id) {
  const lr = lastRead();
  if (!id || (lr[conv] || 0) >= id) return;
  lr[conv] = id;
  store("mesh.lastRead", JSON.stringify(lr));
}
function unread(conv) {
  const c = state.convs.get(conv);
  return c && c.last_id > (lastRead()[conv] || 0) && conv !== state.current ? c.unread || 1 : 0;
}

// ------------------------------------------------------------ rendering: header

function renderStatus() {
  const s = state.status;
  $("node-name").textContent = s.long_name || "Mesh";
  document.title = s.long_name ? `${s.long_name} · Mesh` : "Mesh";
  const meta = [s.node_id, s.hw_model, s.region && `${s.region} ${s.preset || ""}`.trim(), s.firmware && `fw ${s.firmware}`].filter(Boolean);
  $("node-meta").textContent = meta.join(" · ") || (s.state === "connected" ? "" : "Radio not connected");

  const conn = $("conn");
  const radio = s.state || "connecting";
  const label = state.ws === "closed" ? "Offline" : state.ws !== "open" ? "Connecting" : radio === "connected" ? "Radio connected" : radio === "connecting" ? "Connecting radio" : "Radio disconnected";
  conn.dataset.state = state.ws === "closed" ? "disconnected" : state.ws !== "open" ? "connecting" : radio;
  conn.querySelector(".label").textContent = label;

  const banner = $("banner");
  if (state.ws === "closed") {
    banner.hidden = false;
    banner.textContent = "Lost connection to the Pi. Reconnecting…";
  } else if (radio === "disconnected") {
    banner.hidden = false;
    banner.textContent = `The radio is not connected${s.error ? ` (${s.error})` : ""}. Message history is still available; sending works again once it's back.`;
  } else {
    banner.hidden = true;
  }
  updateComposer();
}

// ------------------------------------------------------------ rendering: conversations

function renderConvs() {
  const list = $("conv-list");
  list.replaceChildren();
  const channels = (state.status.channels || []).map((c) => `ch:${c.index}`);
  // channels the node no longer has but that have history
  for (const conv of state.convs.keys()) if (conv.startsWith("ch:") && !channels.includes(conv)) channels.push(conv);
  const dms = [...state.convs.entries()]
    .filter(([conv]) => conv.startsWith("dm:"))
    .sort((a, b) => (b[1].last_time || 0) - (a[1].last_time || 0))
    .map(([conv]) => conv);
  if (state.current?.startsWith("dm:") && !dms.includes(state.current)) dms.unshift(state.current);

  const item = (conv) => {
    const [kind, value] = conv.split(":");
    const n = unread(conv);
    return el("li", {},
      el("button", { type: "button", "aria-current": conv === state.current ? "true" : null, onclick: () => openConv(conv) },
        kind === "ch" ? el("span", { class: "avatar ch", "aria-hidden": "true" }, "#") : el("span", { class: "avatar", "aria-hidden": "true" }, nodeShort(Number(value))),
        el("span", { class: "name" }, kind === "ch" ? channelName(Number(value)) : nodeName(Number(value))),
        n ? el("span", { class: "badge", "aria-label": `${n} unread` }, n > 99 ? "99+" : n) : null));
  };
  list.append(el("li", { class: "section" }, "Channels"), ...channels.map(item));
  list.append(el("li", { class: "section" }, "Direct messages"));
  if (dms.length) list.append(...dms.map(item));
  else list.append(el("li", { class: "muted", style: "padding: 4px 10px 10px" }, "Start one from the Nodes tab."));
}

// ------------------------------------------------------------ rendering: messages

function statusText(m) {
  switch (m.status) {
    case "pending": return "Sending…";
    case "sent": return m.to_num === BROADCAST ? "✓ Sent to mesh" : "✓ Relayed";
    case "acked": return "✓✓ Delivered";
    case "failed": return `Failed${m.error ? ` (${m.error.replaceAll("_", " ").toLowerCase()})` : ""}`;
    default: return "";
  }
}

function messageEl(m) {
  const out = m.direction === "out";
  const t = new Date(m.rx_time * 1000);
  const details = [timeFmt.format(t)];
  if (!out) {
    if (m.hops != null) details.push(m.hops === 0 ? "direct" : `${m.hops} hop${m.hops > 1 ? "s" : ""}`);
    if (m.rx_snr != null) details.push(`SNR ${m.rx_snr} dB`);
  }
  const showFrom = !out && m.to_num === BROADCAST;
  return el("li", { class: `msg ${out ? "out" : "in"} ${m.status === "failed" ? "failed" : ""}`, "data-id": m.id },
    showFrom ? el("span", { class: "from" }, nodeName(m.from_num)) : null,
    el("div", { class: "bubble" }, m.text),
    el("span", { class: "meta" }, details.join(" · "),
      out ? el("span", { class: m.status === "failed" ? "status-failed" : "" }, ` · ${statusText(m)}`) : null));
}

// scroll: "older" keeps the view where it was (history prepended),
// "bottom" jumps to the newest message, "auto" follows only if already at the bottom.
function renderMessages(scroll = "bottom") {
  const box = $("messages");
  const list = $("message-list");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const prevHeight = box.scrollHeight;
  list.replaceChildren();
  let lastDay = "";
  for (const m of state.messages) {
    const day = dayFmt.format(new Date(m.rx_time * 1000));
    if (day !== lastDay) {
      list.append(el("li", { class: "day" }, day));
      lastDay = day;
    }
    list.append(messageEl(m));
  }
  $("empty").hidden = !state.current || state.messages.length > 0;
  if (scroll === "older") box.scrollTop = box.scrollHeight - prevHeight;
  else if (scroll === "bottom" || atBottom) box.scrollTop = box.scrollHeight;
}

function renderThreadHead() {
  const conv = state.current;
  if (!conv) {
    $("thread-title").textContent = "Pick a conversation";
    $("thread-sub").textContent = "";
    return;
  }
  $("thread-title").textContent = convTitle(conv);
  const [kind, value] = conv.split(":");
  if (kind === "ch") {
    const ch = (state.status.channels || []).find((c) => c.index === Number(value));
    $("thread-sub").textContent = ch ? `${ch.role === "primary" ? "Primary" : "Secondary"} channel, everyone on it can read along` : "Channel (not configured on the radio anymore)";
  } else {
    const n = state.nodes.get(Number(value));
    $("thread-sub").textContent = `Direct message · ${hex(Number(value))}${n?.last_heard ? ` · heard ${ago(n.last_heard)}` : ""}`;
  }
}

// ------------------------------------------------------------ rendering: nodes

function renderNodes() {
  const list = $("node-list");
  list.replaceChildren();
  const me = state.nodes.get(state.status.node_num);
  const nodes = [...state.nodes.values()].sort((a, b) => (isMe(b.num) - isMe(a.num)) || (b.last_heard || 0) - (a.last_heard || 0));
  $("node-count").textContent = nodes.length ? String(nodes.length) : "";
  $("nodes-empty").hidden = nodes.length > 0;
  for (const n of nodes) {
    const rows = [];
    const add = (k, v) => v != null && v !== "" && rows.push(el("dt", {}, k), el("dd", {}, v));
    if (!isMe(n.num)) {
      add("Last heard", ago(n.last_heard));
      add("Hops", n.hops_away == null ? null : n.hops_away === 0 ? "direct" : n.hops_away);
      add("SNR", n.snr == null ? null : `${n.snr} dB`);
    }
    add("Battery", n.battery == null ? null : n.battery > 100 ? "plugged in" : `${n.battery} %${n.voltage ? ` (${n.voltage} V)` : ""}`);
    const km = isMe(n.num) ? null : distanceKm(me, n);
    add("Distance", km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
    add("Hardware", n.hw_model && n.hw_model.replaceAll("_", " "));
    const actions = [];
    if (!isMe(n.num)) actions.push(el("button", { type: "button", class: "primary", onclick: () => { switchView("chats"); openConv(`dm:${n.num}`); } }, "Message"));
    const mapHref = n.latitude == null ? null : mapLink(n);
    if (mapHref) actions.push(el("a", { href: mapHref, target: "_blank", rel: "noopener" }, "Show on map"));
    list.append(el("li", { class: "node" },
      el("div", { class: "node-head" },
        el("span", { class: "avatar", "aria-hidden": "true" }, n.short_name || hex(n.num).slice(-4)),
        el("div", { class: "names" },
          el("strong", {}, n.long_name || hex(n.num), isMe(n.num) ? el("span", { class: "me-tag" }, "  this Pi") : null),
          el("span", { class: "muted" }, n.node_id || hex(n.num)))),
      rows.length ? el("dl", {}, rows) : null,
      actions.length ? el("div", { class: "node-actions" }, actions) : null));
  }
}

// ------------------------------------------------------------ actions

async function openConv(conv) {
  state.current = conv;
  store("mesh.current", conv);
  $("view-chats").dataset.pane = "thread";
  state.messages = [];
  renderThreadHead();
  renderConvs();
  renderMessages();
  updateComposer();
  try {
    const rows = await api(`/api/messages?conv=${encodeURIComponent(conv)}&limit=100`);
    if (state.current !== conv) return;
    state.messages = rows;
    $("older").hidden = rows.length < 100;
    renderMessages();
    if (rows.length) markRead(conv, rows[rows.length - 1].id);
    renderConvs();
  } catch (e) {
    showSendError(`Could not load messages: ${e.message}`);
  }
  if (matchMedia("(min-width: 721px)").matches) $("text").focus();
}

async function loadOlder() {
  const conv = state.current;
  if (!conv || !state.messages.length) return;
  const rows = await api(`/api/messages?conv=${encodeURIComponent(conv)}&before=${state.messages[0].id}&limit=100`);
  if (state.current !== conv) return;
  state.messages = [...rows, ...state.messages];
  $("older").hidden = rows.length < 100;
  renderMessages("older");
}

function updateComposer() {
  const text = $("text");
  const canSend = !!state.current && state.status.state === "connected" && state.ws !== "closed";
  text.disabled = !state.current;
  text.placeholder = !state.current ? "Pick a conversation" : state.status.state === "connected" ? `Message ${convTitle(state.current)}` : "Radio not connected";
  const bytes = utf8Bytes(text.value.trim());
  const max = state.config.max_text_bytes;
  const counter = $("bytes");
  counter.textContent = text.value ? `${bytes}/${max}` : "";
  counter.classList.toggle("over", bytes > max);
  $("send").disabled = !canSend || bytes === 0 || bytes > max || state.sending;
  text.style.height = "auto";
  text.style.height = `${Math.min(text.scrollHeight, 140)}px`;
}

function showSendError(msg) {
  const p = $("send-error");
  p.textContent = msg || "";
  p.hidden = !msg;
}

function askPin() {
  return new Promise((resolve) => {
    const dialog = $("pin-dialog");
    const input = $("pin-input");
    input.value = "";
    const done = (value) => {
      dialog.close();
      resolve(value);
    };
    $("pin-cancel").onclick = () => done(null);
    $("pin-form").onsubmit = (e) => { e.preventDefault(); done(input.value); };
    dialog.showModal();
    input.focus();
  });
}

async function send(e) {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text || !state.current || state.sending) return;
  state.sending = true;
  showSendError("");
  updateComposer();
  let pin = store("mesh.pin") || "";
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await api("/api/messages", {
          method: "POST",
          headers: state.config.send_pin_required ? { "X-Send-Pin": pin } : {},
          body: JSON.stringify({ conv: state.current, text }),
        });
        $("text").value = "";
        upsertMessage(row);
        return;
      } catch (err) {
        if (err.status !== 401) throw err;
        pin = await askPin();
        if (pin == null) return;
        store("mesh.pin", pin);
      }
    }
    showSendError("Wrong PIN.");
  } catch (err) {
    showSendError(err.message);
  } finally {
    state.sending = false;
    updateComposer();
  }
}

function upsertMessage(m) {
  const c = state.convs.get(m.conv) || { last_id: 0, last_time: 0, unread: 0 };
  if (m.id > c.last_id) {
    if (m.direction === "in" && m.conv !== state.current) c.unread = (unread(m.conv) || 0) + 1;
    c.last_id = m.id;
    c.last_time = m.rx_time;
  }
  state.convs.set(m.conv, c);
  if (m.conv === state.current) {
    const i = state.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) state.messages[i] = m;
    else state.messages.push(m);
    renderMessages(m.direction === "out" ? "bottom" : "auto");
    if (document.visibilityState === "visible") markRead(m.conv, m.id);
  }
  if (m.direction === "out") markRead(m.conv, m.id);
  renderConvs();
}

function switchView(view) {
  state.view = view;
  for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.view === view));
  $("view-chats").hidden = view !== "chats";
  $("view-nodes").hidden = view !== "nodes";
  if (view === "nodes") renderNodes();
  history.replaceState(null, "", view === "nodes" ? "#nodes" : location.pathname);
}

// ------------------------------------------------------------ data loading

async function loadAll() {
  const [status, nodes, convs] = await Promise.all([api("/api/status"), api("/api/nodes"), api("/api/conversations")]);
  applyStatus(status);
  state.nodes = new Map(nodes.map((n) => [n.num, n]));
  const lr = lastRead();
  state.convs = new Map(convs.map((c) => [c.conv, { ...c, unread: c.last_id > (lr[c.conv] || 0) ? 1 : 0 }]));
  renderConvs();
  if (state.view === "nodes") renderNodes();
  if (state.current) openConv(state.current);
}

function applyStatus(s) {
  if (s.config) state.config = s.config;
  state.status = { ...state.status, ...s };
  renderStatus();
  renderConvs();
  renderThreadHead();
}

// ------------------------------------------------------------ live updates

let wsBackoff = 1000;
function connectLive() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live`);
  let ping;
  ws.onopen = () => {
    state.ws = "open";
    wsBackoff = 1000;
    ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
    // catch up on anything missed while disconnected
    loadAll().catch(() => {});
  };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    if (type === "status") applyStatus(data);
    else if (type === "message") upsertMessage(data);
    else if (type === "node" || type === "nodes") {
      for (const n of type === "node" ? [data] : data) state.nodes.set(n.num, n);
      if (state.view === "nodes") renderNodes();
      renderConvs();
      renderThreadHead();
    }
  };
  ws.onclose = () => {
    clearInterval(ping);
    state.ws = "closed";
    renderStatus();
    setTimeout(connectLive, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 15000);
  };
}

// ------------------------------------------------------------ wiring

$("composer").addEventListener("submit", send);
$("text").addEventListener("input", updateComposer);
$("text").addEventListener("keydown", (e) => {
  // Enter sends on devices with a keyboard; Shift+Enter adds a line break
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("older").addEventListener("click", () => loadOlder().catch((e) => showSendError(e.message)));
$("back").addEventListener("click", () => {
  $("view-chats").dataset.pane = "list";
  state.current = null;
  store("mesh.current", "");
  renderConvs();
  renderThreadHead();
  updateComposer();
});
for (const b of document.querySelectorAll(".tabs button")) b.addEventListener("click", () => switchView(b.dataset.view));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.current && state.messages.length) {
    markRead(state.current, state.messages[state.messages.length - 1].id);
    renderConvs();
  }
});
setInterval(() => { if (state.view === "nodes") renderNodes(); else renderThreadHead(); }, 60000);

state.current = store("mesh.current") || (matchMedia("(min-width: 721px)").matches ? "ch:0" : null);
if (location.hash === "#nodes") switchView("nodes");
renderStatus();
renderConvs();
// Load over REST right away; the websocket only adds live updates (and
// reloads everything when it (re)connects, to catch up on missed events).
loadAll().catch((e) => showSendError(`Could not reach the Pi: ${e.message}`));
connectLive();
