// Mesh web UI: conversations (channels + direct messages), nodes, composer.
// Talks to the FastAPI backend: REST for history, /api/live for push events.
// Built on the shared Outpost UI package (/ui, synced in by start.sh).
import { frame, icon, ago, coords, distance, utcTime, utcDate } from "/ui/outpost.js";

const BROADCAST = 0xffffffff;
const $ = (id) => document.getElementById(id);
const { strip } = frame("mesh");

const state = {
  status: {},
  config: { max_text_bytes: 200, send_pin_required: false, maps_port: "", mesh_map_port: "" },
  nodes: new Map(), // num -> node row
  convs: new Map(), // conv -> { last_id, last_time, unread }
  current: null, // conv key
  messages: [], // rows of the current conversation, oldest first
  view: "chats",
  ws: "connecting", // connecting | open | closed
  sending: false,
  sendError: "",
  loadError: "",
  expanded: new Set(), // node nums with their details open
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
  return null;
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
const wide = () => matchMedia("(min-width: 721px)").matches;

function channelName(index) {
  const ch = (state.status.channels || []).find((c) => c.index === index);
  return ch ? ch.name : `Channel ${index}`;
}

function convTitle(conv) {
  const [kind, value] = conv.split(":");
  return kind === "ch" ? `# ${channelName(Number(value))}` : nodeName(Number(value));
}

function distanceM(a, b) {
  if (a?.latitude == null || b?.latitude == null) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const hopsText = (h) => (h == null ? null : h === 0 ? "DIRECT" : `${h} HOP${h > 1 ? "S" : ""}`);
const batteryText = (b) => (b == null ? null : b > 100 ? "EXT POWER" : `${b}%`);

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

function emptyState(box, iconName, title, text) {
  box.replaceChildren(icon(iconName), el("p", { class: "empty-title" }, title), el("p", {}, text));
}

// ------------------------------------------------------------ unread tracking

function lastRead() {
  try {
    return JSON.parse(store("mesh.lastRead") || "{}");
  } catch {
    return {};
  }
}
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

// ------------------------------------------------------------ rendering: frame

// Status strip, header title, context bar and pinned banners.
function renderStatus() {
  const s = state.status;
  const radio = s.state || "connecting";
  document.title = s.long_name ? `${s.long_name} · Mesh` : "Mesh";

  // Link to this app's own data source: the radio, through this Pi.
  if (state.ws === "closed") strip.setLink("crit", "RADIO · PI UNREACHABLE");
  else if (radio === "connected") strip.setLink("ok", "RADIO · LINKED");
  else if (radio === "connecting" || (state.ws !== "open" && !s.state)) strip.setLink("cau", "RADIO · CONNECTING");
  else strip.setLink("crit", "RADIO · DISCONNECTED");

  const items = [];
  const me = state.nodes.get(s.node_num);
  const bat = batteryText(me?.battery);
  if (radio === "connected" && (s.short_name || s.node_id)) items.push({ label: "NODE", value: s.short_name || s.node_id });
  if (bat) items.push({ label: "BAT", value: bat === "EXT POWER" ? "EXT" : bat });
  if (state.nodes.size) items.push({ label: "NODES", value: String(state.nodes.size) });
  strip.setItems(items);

  renderContext();
  renderPinned();
  updateComposer();
}

function renderContext() {
  const s = state.status;
  const parts = [s.region, s.preset];
  if (state.view === "chats" && state.current) {
    const [kind, value] = state.current.split(":");
    parts.push(kind === "ch" ? `CH ${value} · ${channelName(Number(value))}` : `DM · ${hex(Number(value))}`);
  }
  const shown = parts.filter(Boolean);
  const box = $("context");
  box.hidden = !shown.length;
  box.textContent = shown.join(" · ");
}

function banner(kind, title, body) {
  const shape = { info: "info", cau: "caution", crit: "critical" }[kind];
  return el("div", { class: `banner banner-${kind}`, role: kind === "crit" ? "alert" : "status" },
    icon(shape),
    el("div", { class: "banner-text" },
      el("span", { class: "banner-title" }, title),
      body ? el("span", { class: "banner-body" }, body) : null));
}

function renderPinned() {
  const s = state.status;
  const list = [];
  if (state.ws === "closed") {
    list.push(banner("cau", "Lost connection to the Pi", "Reconnecting. Messages shown here may be out of date."));
  } else if (s.state === "disconnected") {
    list.push(banner("cau", "Radio not connected", `${s.error ? `${s.error}. ` : ""}Message history is still available; sending works again once the radio is back.`));
  }
  if (state.loadError) list.push(banner("crit", "Could not reach the Pi", `${state.loadError}. Check that the mesh app is running; this page retries when the live link comes back.`));
  const box = $("pinned");
  box.replaceChildren(...list);
  box.hidden = !list.length;
}

// Header H1 + back button + mobile pane.
function renderHeader() {
  const f = $("frame");
  f.dataset.view = state.view;
  f.dataset.pane = state.current ? "thread" : "list";
  let title = "Messages";
  if (state.view === "nodes") title = "Nodes";
  else if (state.current) title = convTitle(state.current);
  $("title").textContent = title;
  $("back").hidden = state.view !== "chats" || !state.current;
  renderContext();
}

// ------------------------------------------------------------ rendering: conversations

function renderConvs() {
  const list = $("conv-list");
  const channels = (state.status.channels || []).map((c) => `ch:${c.index}`);
  // channels the node no longer has but that have history
  for (const conv of state.convs.keys()) if (conv.startsWith("ch:") && !channels.includes(conv)) channels.push(conv);
  const dms = [...state.convs.entries()]
    .filter(([conv]) => conv.startsWith("dm:"))
    .sort((a, b) => (b[1].last_time || 0) - (a[1].last_time || 0))
    .map(([conv]) => conv);
  if (state.current?.startsWith("dm:") && !dms.includes(state.current)) dms.unshift(state.current);

  let total = 0;
  const item = (conv) => {
    const [kind, value] = conv.split(":");
    const num = Number(value);
    const n = unread(conv);
    total += n;
    const c = state.convs.get(conv);
    const meta = [];
    if (kind === "ch") {
      const ch = (state.status.channels || []).find((x) => x.index === num);
      meta.push(ch ? `CH ${num} · ${ch.role === "primary" ? "PRIMARY" : "SECONDARY"}` : `CH ${num} · NOT ON RADIO`);
    } else {
      meta.push(hex(num));
      const node = state.nodes.get(num);
      if (node?.last_heard) meta.push(`HEARD ${ago(node.last_heard)}`);
    }
    if (c?.last_time) meta.push(`LAST ${utcTime(c.last_time * 1000)}`);
    return el("li", {},
      el("button", { type: "button", class: "row has-mono", "aria-current": conv === state.current ? "true" : null, onclick: () => openConv(conv) },
        el("span", { class: "monogram", "aria-hidden": "true" }, kind === "ch" ? "#" : nodeShort(num)),
        el("span", { class: "row-main" },
          el("span", { class: "row-title" }, kind === "ch" ? channelName(num) : nodeName(num)),
          el("span", { class: "row-meta" }, meta.join(" · "))),
        n ? el("span", { class: "badge badge-info badge-sm" }, icon("message"), `${n > 99 ? "99+" : n} NEW`) : null,
        icon("chevron")));
  };
  const items = [
    el("li", { class: "list-section label" }, "Channels"),
    ...channels.map(item),
    el("li", { class: "list-section label" }, "Direct messages"),
  ];
  if (dms.length) items.push(...dms.map(item));
  else items.push(el("li", { class: "list-hint help" }, "Start one from the Nodes tab."));
  list.replaceChildren(...items);
  $("unread-total").textContent = total ? `· ${total > 99 ? "99+" : total}` : "";
}

// ------------------------------------------------------------ rendering: messages

// Delivery state: fixed status shapes (info / ok / critical) + word.
function deliveryEl(m) {
  switch (m.status) {
    case "pending":
      return el("span", { class: "msg-state", title: "Handing the message to the radio" }, icon("info", "i-xs"), "SENDING");
    case "sent":
      return el("span", { class: "msg-state", title: m.to_num === BROADCAST ? "Sent to the mesh" : "Relayed, waiting for the recipient" },
        icon("info", "i-xs"), m.to_num === BROADCAST ? "SENT" : "SENT · RELAYED");
    case "acked":
      return el("span", { class: "msg-state is-ok", title: "Delivered: the recipient confirmed" }, icon("ok", "i-xs"), "ACK");
    case "failed":
      return el("span", { class: "msg-state is-crit" }, icon("critical", "i-xs"),
        `FAILED${m.error ? ` · ${m.error.replaceAll("_", " ")}` : " · NO ACK"}`,
        el("button", { type: "button", class: "btn btn-sm retry", onclick: () => retry(m) }, icon("refresh"), "Retry"));
    default:
      return null;
  }
}

function messageEl(m) {
  const out = m.direction === "out";
  const meta = [];
  meta.push(el("b", {}, out ? (state.status.short_name || "YOU") : nodeName(m.from_num)));
  if (!out) {
    const hops = hopsText(m.hops);
    if (hops) meta.push(el("span", {}, hops));
    if (m.rx_snr != null) meta.push(el("span", {}, `SNR ${m.rx_snr} dB`));
  }
  meta.push(el("time", { datetime: new Date(m.rx_time * 1000).toISOString() }, utcTime(m.rx_time * 1000)));
  return el("li", { class: `msg ${out ? "msg-out" : ""}`, "data-id": m.id },
    el("span", { class: "msg-meta" }, meta),
    el("span", { class: "msg-text" }, m.text),
    out ? deliveryEl(m) : null);
}

function dividerLabel(ts) {
  const day = utcDate(ts * 1000);
  const today = utcDate(Date.now());
  const yesterday = utcDate(Date.now() - 86400000);
  const name = day === today ? "TODAY" : day === yesterday ? "YESTERDAY" : day;
  return `${name} · ${utcTime(ts * 1000)}`;
}

// scroll: "older" keeps the view where it was (history prepended),
// "bottom" jumps to the newest message, "auto" follows only if already at the bottom.
function renderMessages(scroll = "bottom") {
  const box = $("messages");
  const list = $("message-list");
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const prevHeight = box.scrollHeight;
  const items = [];
  let lastDay = "";
  for (const m of state.messages) {
    const day = utcDate(m.rx_time * 1000);
    if (day !== lastDay) {
      items.push(el("li", { class: "divider", role: "separator" }, dividerLabel(m.rx_time)));
      lastDay = day;
    }
    items.push(messageEl(m));
  }
  list.replaceChildren(...items);

  const empty = $("empty");
  if (!state.current) {
    empty.hidden = false;
    emptyState(empty, "message", "No conversation open", "Pick a channel or a direct message from the list.");
  } else if (!state.messages.length) {
    empty.hidden = false;
    emptyState(empty, "message", "No messages yet",
      state.current.startsWith("ch:") ? "Messages on this channel show up here as they arrive." : "Send the first message; it is delivered when the node is in range.");
  } else {
    empty.hidden = true;
  }
  if (scroll === "older") box.scrollTop = box.scrollHeight - prevHeight;
  else if (scroll === "bottom" || atBottom) box.scrollTop = box.scrollHeight;
}

function renderThreadHead() {
  const conv = state.current;
  const sub = $("thread-sub");
  renderHeader();
  if (!conv) {
    sub.textContent = "";
    sub.hidden = true;
    return;
  }
  sub.hidden = false;
  const [kind, value] = conv.split(":");
  if (kind === "ch") {
    const ch = (state.status.channels || []).find((c) => c.index === Number(value));
    sub.textContent = ch ? `${ch.role === "primary" ? "Primary" : "Secondary"} channel · everyone on it can read along` : "Channel not configured on the radio anymore";
  } else {
    const n = state.nodes.get(Number(value));
    sub.textContent = `Direct message · ${hex(Number(value))}${n?.last_heard ? ` · heard ${ago(n.last_heard)}` : ""}`;
  }
}

// ------------------------------------------------------------ rendering: nodes

function renderNodes() {
  const list = $("node-list");
  const me = state.nodes.get(state.status.node_num);
  const nodes = [...state.nodes.values()].sort((a, b) => (isMe(b.num) - isMe(a.num)) || (b.last_heard || 0) - (a.last_heard || 0));
  $("node-count").textContent = nodes.length ? `· ${nodes.length}` : "";
  const empty = $("nodes-empty");
  empty.hidden = nodes.length > 0;
  if (!nodes.length) emptyState(empty, "nodes", "No nodes heard yet", "Nodes appear here as soon as the radio hears them. That can take a few minutes after start-up.");

  list.replaceChildren(...nodes.map((n) => {
    const mine = isMe(n.num);
    const m = mine ? null : distanceM(me, n);
    const open = state.expanded.has(n.num);
    const detailId = `node-${n.num}`;

    const meta = [n.node_id || hex(n.num)];
    if (!mine) {
      meta.push(ago(n.last_heard));
      const hops = hopsText(n.hops_away);
      if (hops) meta.push(hops);
      if (n.snr != null) meta.push(`SNR ${n.snr} dB`);
    }
    const value = m != null ? distance(m) : batteryText(n.battery);

    const rows = [];
    const add = (k, v) => v != null && v !== "" && rows.push(el("dt", {}, k), el("dd", {}, v));
    if (!mine) {
      add("Last heard", ago(n.last_heard));
      add("Hops", hopsText(n.hops_away));
      add("SNR", n.snr == null ? null : `${n.snr} dB`);
    }
    add("Battery", n.battery == null ? null : `${batteryText(n.battery)}${n.voltage ? ` · ${n.voltage} V` : ""}`);
    add("Distance", m == null ? null : distance(m));
    add("Position", n.latitude == null ? null : coords(n.latitude, n.longitude));
    add("Hardware", n.hw_model && n.hw_model.replaceAll("_", " "));
    if (mine) {
      add("Firmware", state.status.firmware);
      add("Radio", [state.status.region, state.status.preset].filter(Boolean).join(" · "));
    }

    const actions = [];
    if (!mine) actions.push(el("button", { type: "button", class: "btn", onclick: () => { switchView("chats"); openConv(`dm:${n.num}`); } }, icon("message"), "Message"));
    const mapHref = n.latitude == null ? null : mapLink(n);
    if (mapHref) actions.push(el("a", { class: "btn", href: mapHref, target: "_blank", rel: "noopener" }, icon("map"), "Show on map", icon("external", "i-sm")));

    return el("li", { class: open ? "is-open" : null },
      el("button", {
        type: "button", class: "row has-mono", "aria-expanded": String(open), "aria-controls": detailId,
        onclick: () => { if (open) state.expanded.delete(n.num); else state.expanded.add(n.num); renderNodes(); },
      },
      el("span", { class: "monogram", "aria-hidden": "true" }, n.short_name || hex(n.num).slice(-4)),
      el("span", { class: "row-main" },
        el("span", { class: "row-title" }, n.long_name || hex(n.num)),
        el("span", { class: "row-meta" }, meta.join(" · "))),
      mine ? el("span", { class: "badge badge-sm" }, icon("mesh"), "THIS PI") : null,
      value ? el("span", { class: "row-value" }, value) : null,
      icon("chevron", "row-chevron")),
      el("div", { class: "node-detail", id: detailId, hidden: !open },
        rows.length ? el("dl", { class: "kv" }, rows) : null,
        actions.length ? el("div", { class: "node-actions" }, actions) : null));
  }));
}

// ------------------------------------------------------------ actions

async function openConv(conv) {
  state.current = conv;
  store("mesh.current", conv);
  state.messages = [];
  state.sendError = "";
  $("older").hidden = true;
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
  if (wide()) $("text").focus();
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

// Composer: byte counter, why sending is blocked, send errors.
function updateComposer() {
  const text = $("text");
  const radioUp = state.status.state === "connected" && state.ws !== "closed";
  text.disabled = !state.current;
  text.placeholder = !state.current ? "Pick a conversation" : radioUp ? `Message ${convTitle(state.current)}` : "Radio not connected";
  const bytes = utf8Bytes(text.value.trim());
  const max = state.config.max_text_bytes;
  const over = bytes > max;
  const counter = $("bytes");
  counter.textContent = `${bytes}/${max} B`;
  counter.classList.toggle("is-over", over);
  text.setAttribute("aria-invalid", String(over));
  $("send").disabled = !state.current || !radioUp || bytes === 0 || over || state.sending;

  let note = null;
  if (state.sendError) note = ["crit", state.sendError];
  else if (over) note = ["crit", `Message is ${bytes} B, the limit is ${max} B. Shorten it to send.`];
  else if (state.current && state.ws === "closed") note = ["cau", "Cannot send: the Pi is unreachable. Reconnecting."];
  else if (state.current && state.status.state !== "connected") note = ["cau", "Cannot send: the radio is not connected."];
  const p = $("composer-note");
  p.hidden = !note;
  if (note) {
    p.className = `composer-note is-${note[0]}`;
    p.replaceChildren(icon(note[0] === "crit" ? "critical" : "caution", "i-sm"), el("span", {}, note[1]));
  }

  text.style.height = "auto";
  text.style.height = `${Math.min(text.scrollHeight, 160)}px`;
}

function showSendError(msg) {
  state.sendError = msg || "";
  updateComposer();
}

function askPin(again) {
  return new Promise((resolve) => {
    const dialog = $("pin-dialog");
    const input = $("pin-input");
    const err = $("pin-error");
    input.value = "";
    err.hidden = !again;
    $("pin-field").classList.toggle("is-error", !!again);
    input.setAttribute("aria-invalid", String(!!again));
    if (again) err.replaceChildren(icon("critical", "i-sm"), "Wrong PIN. Try again.");
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(value);
    };
    $("pin-cancel").onclick = () => done(null);
    $("pin-form").onsubmit = (e) => { e.preventDefault(); done(input.value); };
    dialog.oncancel = () => done(null); // Escape
    dialog.showModal();
    input.focus();
  });
}

// POST a message, asking for the PIN when the server wants one.
// Returns true when it was handed to the radio.
async function sendText(conv, text) {
  let pin = store("mesh.pin") || "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await api("/api/messages", {
        method: "POST",
        headers: state.config.send_pin_required ? { "X-Send-Pin": pin } : {},
        body: JSON.stringify({ conv, text }),
      });
      upsertMessage(row);
      return true;
    } catch (err) {
      if (err.status !== 401) throw err;
      pin = await askPin(attempt > 0 || !!store("mesh.pin"));
      if (pin == null) return false;
      store("mesh.pin", pin);
    }
  }
  throw new Error("Wrong PIN");
}

async function send(e) {
  e.preventDefault();
  const text = $("text").value.trim();
  if (!text || !state.current || state.sending || $("send").disabled) return;
  state.sending = true;
  showSendError("");
  try {
    if (await sendText(state.current, text)) $("text").value = "";
  } catch (err) {
    showSendError(`Not sent: ${err.message}.`);
  } finally {
    state.sending = false;
    updateComposer();
  }
}

// FAILED → send the same text again (a new message; the failed one stays).
async function retry(m) {
  if (state.sending) return;
  state.sending = true;
  showSendError("");
  try {
    await sendText(m.conv, m.text);
  } catch (err) {
    showSendError(`Retry failed: ${err.message}.`);
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
  for (const b of document.querySelectorAll(".tabs .tab")) b.setAttribute("aria-selected", String(b.dataset.view === view));
  $("view-chats").hidden = view !== "chats";
  $("view-nodes").hidden = view !== "nodes";
  if (view === "nodes") renderNodes();
  renderHeader();
  history.replaceState(null, "", view === "nodes" ? "#nodes" : location.pathname);
}

function closeConv() {
  state.current = null;
  state.messages = [];
  store("mesh.current", "");
  renderConvs();
  renderThreadHead();
  renderMessages();
  updateComposer();
}

// ------------------------------------------------------------ data loading

async function loadAll() {
  const [status, nodes, convs] = await Promise.all([api("/api/status"), api("/api/nodes"), api("/api/conversations")]);
  state.loadError = "";
  state.nodes = new Map(nodes.map((n) => [n.num, n]));
  const lr = lastRead();
  state.convs = new Map(convs.map((c) => [c.conv, { ...c, unread: c.last_id > (lr[c.conv] || 0) ? 1 : 0 }]));
  applyStatus(status);
  renderNodes();
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
    renderStatus();
    // catch up on anything missed while disconnected
    loadAll().catch(() => {});
  };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    if (type === "status") applyStatus(data);
    else if (type === "message") upsertMessage(data);
    else if (type === "node" || type === "nodes") {
      for (const n of type === "node" ? [data] : data) state.nodes.set(n.num, n);
      renderNodes();
      renderStatus();
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

$("back").replaceChildren(icon("back"));
$("send").replaceChildren(icon("send"));
$("composer").addEventListener("submit", send);
$("text").addEventListener("input", () => {
  if (state.sendError) state.sendError = "";
  updateComposer();
});
$("text").addEventListener("keydown", (e) => {
  // Enter sends on devices with a keyboard; Shift+Enter adds a line break
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(hover: hover)").matches) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("older").addEventListener("click", () => loadOlder().catch((e) => showSendError(`Could not load older messages: ${e.message}`)));
$("back").addEventListener("click", closeConv);
for (const b of document.querySelectorAll(".tabs .tab")) b.addEventListener("click", () => switchView(b.dataset.view));
// arrow keys move between tabs (WAI-ARIA tabs pattern)
document.querySelector(".tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const next = state.view === "chats" ? "nodes" : "chats";
  switchView(next);
  $(`tab-${next}`).focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.current && state.messages.length) {
    markRead(state.current, state.messages[state.messages.length - 1].id);
    renderConvs();
  }
});
matchMedia("(min-width: 721px)").addEventListener("change", renderHeader);
// keep "3 MIN AGO" ages fresh
setInterval(() => { if (state.view === "nodes") renderNodes(); else { renderThreadHead(); renderConvs(); } }, 60000);

state.current = store("mesh.current") || (wide() ? "ch:0" : null);
if (location.hash === "#nodes") switchView("nodes");
renderStatus();
renderConvs();
renderThreadHead();
renderMessages();
renderNodes();
// Load over REST right away; the websocket only adds live updates (and
// reloads everything when it (re)connects, to catch up on missed events).
loadAll().catch((e) => {
  state.loadError = e.message;
  renderPinned();
});
connectLive();
