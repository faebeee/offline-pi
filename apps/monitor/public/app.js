/* System module (pi-monitor): renders snapshots pushed over Socket.IO on the
 * Outpost frame. No build step and no external dependencies, so it works
 * fully offline. `io` comes from /socket.io/socket.io.js (classic script). */
import {
  frame, iconHtml, badgeHtml, escapeHtml as esc, STATUS, progress, signalBars, onVisibility,
  utcTime, utcClock, utcDate, utcDateTime, ago,
} from '/ui/outpost.js';

const { strip } = frame('system');

const $ = (id) => document.getElementById(id);
const state = {
  range: 'live',
  live: [],
  minutes: [],
  events: [],
  snap: null,
  intervalMs: 2000,
  link: 'connecting', // live | connecting | reconnecting | error
};
const LIVE_WINDOW = 15 * 60e3;

try {
  const saved = localStorage.getItem('pi-monitor-range');
  if (saved === 'live' || saved === 'day') state.range = saved;
} catch { /* storage unavailable */ }

// -------------------------------------------------------------- formatting
const fmtBytes = (n, digits = 1) => {
  if (n == null || !Number.isFinite(n)) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (Math.abs(n) >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
};
const fmtRate = (n) => (n == null ? '--' : `${fmtBytes(n)}/s`);
const fmtNum = (n, d = 1) => (n == null || !Number.isFinite(n) ? '--' : n.toFixed(d));
const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}D ${h}H ${m}M` : h ? `${h}H ${m}M` : `${m}M`;
};

// -------------------------------------------------------------- thresholds
const levelFor = (v, warn, serious, crit, lowerIsWorse = false) => {
  if (v == null) return null;
  const worse = (a, b) => (lowerIsWorse ? a <= b : a >= b);
  if (worse(v, crit)) return 'critical';
  if (worse(v, serious)) return 'serious';
  if (worse(v, warn)) return 'warning';
  return 'good';
};
const SEV_LABEL = { good: 'Normal', warning: 'Elevated', serious: 'High', critical: 'Critical' };
const SEV_RANK = { good: 0, warning: 1, serious: 2, critical: 3 };
/** Outpost status per severity: ok / cau / crit. */
const TONE = { good: 'ok', warning: 'cau', serious: 'crit', critical: 'crit' };
const tempLevel = (c) => levelFor(c, 70, 80, 85);
const voltLevel = (v) => levelFor(v, 4.85, 4.75, 4.65, true);
const pctLevel = (p) => levelFor(p, 80, 90, 95);

// ------------------------------------------------------------ UI pieces
/** Small status badge as HTML: colour + fixed shape + word (text escaped). */
const badgeSm = (tone, text) => badgeHtml(tone, text, 'badge-sm');

function bannerHtml(tone, title, body) {
  const cls = { info: 'banner-info', ok: 'banner-ok', cau: 'banner-cau', crit: 'banner-crit' }[tone];
  return `<div class="banner ${cls}">${iconHtml(STATUS[tone].icon)}<div class="banner-text">` +
    `<div class="banner-title">${esc(title)}</div>${body ? `<div class="banner-body">${esc(body)}</div>` : ''}</div></div>`;
}

/** Fill a .cells / .progress element: `count` segments, ratio 0..1, tone ok/cau/crit. */
function fillCells(el, ratio, tone, count = 10) {
  if (el.children.length !== count) {
    el.replaceChildren(...Array.from({ length: count }, () => document.createElement('i')));
  }
  const lit = Math.round(Math.max(0, Math.min(1, ratio || 0)) * count);
  [...el.children].forEach((c, i) => c.classList.toggle('on', i < lit));
  el.classList.toggle('is-cau', tone === 'cau');
  el.classList.toggle('is-crit', tone === 'crit');
}

/** Only touch the DOM when the markup actually changed (keeps live regions quiet). */
const rendered = new WeakMap();
function setHtml(el, html) {
  if (rendered.get(el) !== html) { el.innerHTML = html; rendered.set(el, html); }
}

function kv(id, rows) {
  setHtml($(id), rows
    .filter((r) => r && r[1] != null && r[1] !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join(''));
}

const READOUTS = ['ro-temp', 'ro-volt', 'ro-cpu', 'ro-mem'];
const readoutLevel = {};

/** Readout: big mono value, severity badge (icon + word), cells. */
function setReadout(id, { value, level, label, ratio, cellTone, meta }) {
  const ro = $(id);
  ro.querySelector('.readout-value').textContent = value;
  setHtml(ro.querySelector('.ro-badge'), level ? badgeSm(TONE[level], label || SEV_LABEL[level]) : '');
  const c = ro.querySelector('.cells');
  c.hidden = ratio == null;
  if (ratio != null) fillCells(c, ratio, cellTone ?? (level ? TONE[level] : 'ok'));
  ro.querySelector('.readout-meta').textContent = meta || '';
  readoutLevel[id] = level;
}

/** Corner brackets on the readout that matters most (the worst one, else temperature). */
function markFocus() {
  let best = READOUTS[0], rank = 0;
  for (const id of READOUTS) {
    const r = SEV_RANK[readoutLevel[id]] ?? 0;
    if (r > rank) { rank = r; best = id; }
  }
  for (const id of READOUTS) $(id).classList.toggle('brackets', id === best);
}

// ------------------------------------------------------------------ charts
const charts = {};
const tooltip = $('tooltip');

/**
 * Minimal SVG line chart with a crosshair tooltip. Colours come from CSS
 * classes (tone-info, tone-fg2) via currentColor.
 * series: [{ key, label, tone, dashed, fmt }]
 */
function lineChart(id, series, opts = {}) {
  const el = $(id);
  const chart = { el, series, opts, points: [] };
  charts[id] = chart;
  el.addEventListener('pointermove', (e) => hover(chart, e));
  el.addEventListener('pointerleave', () => {
    tooltip.hidden = true;
    chart.el.querySelector('.hover')?.remove();
  });
  return chart;
}

function scales(chart) {
  const w = chart.el.clientWidth, h = chart.el.clientHeight;
  const pad = { l: 44, r: 8, t: 6, b: 18 };
  const pts = chart.points;
  const now = Date.now();
  const t0 = state.range === 'live' ? now - LIVE_WINDOW : (pts[0]?.t ?? now - 864e5);
  const t1 = state.range === 'live' ? now : Math.max(now, pts.at(-1)?.t ?? now);
  let lo = chart.opts.min ?? Infinity, hi = chart.opts.max ?? -Infinity;
  for (const p of pts) for (const s of chart.series) {
    const v = p[s.key];
    if (v == null) continue;
    if (chart.opts.min == null || v < lo) lo = Math.min(lo, v);
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (chart.opts.floor != null) lo = Math.min(lo, chart.opts.floor);
  if (chart.opts.ceil != null) hi = Math.max(hi, chart.opts.ceil);
  if (hi - lo < (chart.opts.minSpan ?? 1e-9)) {
    const mid = (hi + lo) / 2, span = chart.opts.minSpan ?? 1;
    lo = mid - span / 2; hi = mid + span / 2;
  }
  const x = (t) => pad.l + ((t - t0) / (t1 - t0 || 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);
  return { w, h, pad, t0, t1, lo, hi, x, y };
}

const axisTime = (t) => (state.range === 'day' ? `${utcDate(t).slice(5)} ${utcTime(t)}` : utcTime(t));
const tipTime = (t) => (state.range === 'day' ? utcDateTime(t) : utcClock(t));

function draw(chart) {
  const { w, h, pad, t0, lo, hi, x, y } = scales(chart);
  if (!w || !h) return;
  const fmtAxis = chart.opts.axisFmt || ((v) => fmtNum(v, 0));
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(chart.opts.label || '')}">`;
  for (let i = 0; i <= 2; i++) {
    const v = lo + ((hi - lo) * i) / 2, yy = y(v);
    svg += `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}"/>`;
    svg += `<text class="axis" x="${pad.l - 6}" y="${yy + 3}" text-anchor="end">${esc(fmtAxis(v))}</text>`;
  }
  svg += `<text class="axis" x="${pad.l}" y="${h - 4}">${esc(axisTime(t0))}</text>`;
  svg += `<text class="axis" x="${w - pad.r}" y="${h - 4}" text-anchor="end">NOW</text>`;

  if (!chart.points.length) {
    svg += `<text class="axis" x="${w / 2}" y="${h / 2}" text-anchor="middle">COLLECTING DATA</text>`;
  }
  const gapMs = (state.range === 'live' ? state.intervalMs : 60e3) * 3;
  for (const s of chart.series) {
    // split into segments at gaps (e.g. while the service was down)
    const segs = [];
    let cur = null, prevT = null;
    for (const p of chart.points) {
      const v = p[s.key];
      if (v == null) { cur = null; continue; }
      if (!cur || p.t - prevT > gapMs) { cur = []; segs.push(cur); }
      cur.push([x(p.t).toFixed(1), y(v).toFixed(1)]);
      prevT = p.t;
    }
    if (!segs.length) continue;
    svg += `<g class="series tone-${s.tone}">`;
    const d = segs.map((seg) => 'M' + seg.map((q) => q.join(',')).join('L')).join('');
    if (chart.series.length === 1) {
      const base = y(lo).toFixed(1);
      const area = segs.map((seg) => `M${seg[0][0]},${base}L${seg.map((q) => q.join(',')).join('L')}L${seg.at(-1)[0]},${base}Z`).join('');
      svg += `<path class="area" d="${area}"/>`;
    }
    svg += `<path class="line${s.dashed ? ' dashed' : ''}" d="${d}"/>`;
    if (chart.series.length > 1) {
      const lp = segs.at(-1).at(-1);
      svg += `<circle class="dot" cx="${lp[0]}" cy="${lp[1]}" r="3"/>`;
    }
    svg += '</g>';
  }
  svg += '</svg>';
  chart.el.innerHTML = svg;
}

function hover(chart, e) {
  const pts = chart.points;
  if (!pts.length) return;
  const rect = chart.el.getBoundingClientRect();
  const { x, y, h, pad } = scales(chart);
  const mx = e.clientX - rect.left;
  let best = pts[0], bestD = Infinity;
  for (const p of pts) {
    const dd = Math.abs(x(p.t) - mx);
    if (dd < bestD) { bestD = dd; best = p; }
  }
  const svg = chart.el.querySelector('svg');
  if (!svg) return;
  svg.querySelector('.hover')?.remove();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'hover');
  const bx = x(best.t);
  let inner = `<line class="cross" x1="${bx}" x2="${bx}" y1="${pad.t}" y2="${h - pad.b}"/>`;
  for (const s of chart.series) {
    const v = best[s.key];
    if (v != null) inner += `<circle class="dot tone-${s.tone}" cx="${bx}" cy="${y(v)}" r="4"/>`;
  }
  g.innerHTML = inner;
  svg.appendChild(g);

  tooltip.innerHTML = `<div class="tooltip-time">${esc(tipTime(best.t))}</div>` +
    chart.series.map((s) => `<div><i class="sw tone-${s.tone}"></i>${esc(s.label)} <b>${esc(s.fmt(best[s.key]))}</b></div>`).join('');
  tooltip.hidden = false;
  const tw = tooltip.offsetWidth;
  let left = e.clientX + 14;
  if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 14;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, rect.top + 4)}px`;
}

function redrawCharts() {
  if (document.hidden) return;
  const pts = state.range === 'live' ? state.live : state.minutes;
  for (const c of Object.values(charts)) { c.points = pts; draw(c); }
}

const unitFmt = (unit, d) => (v) => (v == null ? '--' : `${fmtNum(v, d)} ${unit}`);
lineChart('chart-temp', [{ key: 'temp', label: 'CPU temp', tone: 'info', fmt: unitFmt('°C', 1) }],
  { label: 'CPU temperature over time', minSpan: 10 });
lineChart('chart-volt', [{ key: 'volt', label: 'Input', tone: 'info', fmt: unitFmt('V', 3) }],
  { label: 'Input voltage over time', minSpan: 0.2, axisFmt: (v) => v.toFixed(2) });
lineChart('chart-cpu', [{ key: 'cpu', label: 'CPU', tone: 'info', fmt: unitFmt('%', 1) }],
  { label: 'CPU usage over time', min: 0, ceil: 100 });
lineChart('chart-mem', [{ key: 'mem', label: 'Memory', tone: 'info', fmt: unitFmt('%', 1) }],
  { label: 'Memory usage over time', min: 0, ceil: 100 });
lineChart('chart-net', [
  { key: 'rx', label: 'Down', tone: 'info', fmt: fmtRate },
  { key: 'tx', label: 'Up', tone: 'fg2', dashed: true, fmt: fmtRate },
], { label: 'Network throughput over time', min: 0, minSpan: 1024, axisFmt: (v) => fmtBytes(v, 0) });

// ------------------------------------------------------- strip and link
// Link to this app's own data source (the local monitor server).
const LINK = {
  live: ['ok', 'LOCAL · LIVE'],
  connecting: ['cau', 'LOCAL · CONNECTING'],
  reconnecting: ['cau', 'LOCAL · RECONNECTING'],
  error: ['crit', 'LOCAL · NO LINK'],
};

function setLink(link) {
  state.link = link;
  strip.setLink(...LINK[link]);
  updateStrip();
  renderNotices();
}

function updateStrip() {
  const s = state.snap;
  const items = [];
  if (s) {
    if (s.temps.cpu != null) items.push({ label: 'TEMP', value: `${fmtNum(s.temps.cpu, 1)}°C` });
    if (s.power.inputVolts != null) items.push({ label: 'VOLT', value: `${fmtNum(s.power.inputVolts, 2)} V` });
    else if (s.power.coreVolts != null) items.push({ label: 'VCORE', value: `${fmtNum(s.power.coreVolts, 3)} V` });
    if (s.power.psuMaxCurrentMa != null) items.push({ label: 'PSU', value: `${(s.power.psuMaxCurrentMa / 1000).toFixed(1)} A` });
    if (state.link !== 'live') items.push({ label: 'DATA', value: ago(s.ts / 1000) });
  }
  const key = JSON.stringify(items);
  if (key !== updateStrip.key) { updateStrip.key = key; strip.setItems(items); }
}

// ---------------------------------------------------------------- render
function render(s) {
  if (!s) return;
  state.snap = s;
  if (document.hidden) return;
  const sys = s.system;
  $('hostname').textContent = sys.hostname;
  document.title = `${sys.hostname} · System`;
  $('context').textContent = [sys.model || 'Unknown hardware', sys.os, `Up ${fmtUptime(sys.uptimeSec)}`]
    .filter(Boolean).join(' · ');

  updateStrip();
  renderHealth(s);

  // temperature
  const tc = s.temps.cpu;
  setReadout('ro-temp', {
    value: fmtNum(tc, 1),
    level: tempLevel(tc),
    ratio: tc == null ? null : tc / 90,
    meta: s.fan ? `Fan ${s.fan.rpm ?? '--'} rpm` : 'No fan detected',
  });
  kv('temp-list', [
    ...s.temps.sensors.filter((x) => x.name !== 'CPU').map((x) => [x.name, `${fmtNum(x.celsius, 1)} °C`]),
    s.fan ? ['Fan', `${s.fan.rpm ?? '--'} rpm${s.fan.pwmPercent != null ? ` (${s.fan.pwmPercent}%)` : ''}`] : ['Fan', 'not detected'],
    ['Soft temp limit', s.throttle ? (s.throttle.now.softTempLimit ? 'active' : 'inactive') : null],
  ]);

  // power
  const p = s.power;
  const extras = [
    p.inputVolts != null && p.coreVolts != null ? `Core ${fmtNum(p.coreVolts, 3)} V` : null,
    p.socWatts != null ? `${fmtNum(p.socWatts, 2)} W` : null,
  ].filter(Boolean).join(' · ');
  if (p.inputVolts != null) {
    const lvl = voltLevel(p.inputVolts);
    $('volt-label').textContent = 'Input 5 V';
    setReadout('ro-volt', {
      value: fmtNum(p.inputVolts, 2),
      level: lvl,
      label: lvl === 'good' ? 'Normal' : 'Low',
      ratio: (p.inputVolts - 4.6) / 0.6,
      meta: extras,
    });
  } else if (p.coreVolts != null) {
    $('volt-label').textContent = 'Core voltage';
    setReadout('ro-volt', { value: fmtNum(p.coreVolts, 3), level: null, ratio: null, meta: extras });
  } else {
    $('volt-label').textContent = 'Voltage';
    setReadout('ro-volt', { value: '--', level: null, ratio: null, meta: s.vcgencmd ? 'No reading' : 'vcgencmd unavailable' });
  }
  kv('power-list', [
    ['Input voltage', p.inputVolts != null ? `${fmtNum(p.inputVolts, 3)} V` : null],
    ['Core voltage', p.coreVolts != null ? `${fmtNum(p.coreVolts, 3)} V` : null],
    ['Board power (PMIC)', p.socWatts != null ? `${fmtNum(p.socWatts, 2)} W` : null],
    ['PSU max current', p.psuMaxCurrentMa != null ? `${(p.psuMaxCurrentMa / 1000).toFixed(1)} A${p.psuMaxCurrentMa < 5000 ? ' (not 5 A)' : ''}` : null],
    ['USB current limit', p.usbHighCurrent == null ? null : p.usbHighCurrent ? '1.6 A' : '600 mA'],
    ['USB over-current', p.usbOverCurrent == null ? null : p.usbOverCurrent ? 'DETECTED' : 'no'],
    !s.vcgencmd ? ['vcgencmd', 'unavailable'] : null,
  ]);
  $('rails-wrap').hidden = !p.rails.length;
  setHtml($('rails'), p.rails.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.volts, 3)}</td><td class="num">${fmtNum(r.amps, 3)}</td><td class="num">${r.volts != null && r.amps != null ? fmtNum(r.volts * r.amps, 2) : '--'}</td></tr>`).join(''));
  $('chart-volt').hidden = p.inputVolts == null;

  renderFlags(s);

  // cpu
  const cpuLvl = pctLevel(s.cpu.usage);
  setReadout('ro-cpu', {
    value: fmtNum(s.cpu.usage, 0),
    level: null,
    ratio: s.cpu.usage == null ? null : s.cpu.usage / 100,
    cellTone: cpuLvl ? TONE[cpuLvl] : 'ok',
    meta: `Load ${s.cpu.load[0].toFixed(2)} · ${s.cpu.cores.length} cores`,
  });
  const cores = $('cores');
  if (cores.children.length !== s.cpu.cores.length) {
    cores.innerHTML = s.cpu.cores.map((_, i) =>
      `<div class="core"><div class="progress-head"><span class="label">Core ${i}</span><span class="data core-val"></span></div><div class="progress"></div></div>`).join('');
  }
  s.cpu.cores.forEach((c, i) => {
    const el = cores.children[i];
    const mhz = s.cpu.freqMhz[i];
    el.querySelector('.core-val').textContent = `${fmtNum(c, 0)}%${mhz ? ` · ${mhz} MHz` : ''}`;
    const bar = el.querySelector('.progress');
    const lvl = pctLevel(c);
    progress(bar, c / 100, 20, lvl === 'warning' ? 'cau' : lvl === 'serious' || lvl === 'critical' ? 'crit' : undefined);
    bar.setAttribute('aria-label', `Core ${i} usage`);
  });
  kv('cpu-list', [
    ['Load 1/5/15 min', s.cpu.load.map((l) => l.toFixed(2)).join(' / ')],
    ['Max frequency', s.cpu.maxFreqMhz ? `${s.cpu.maxFreqMhz} MHz` : null],
    ['Frequency capped', s.throttle ? (s.throttle.now.freqCapped ? 'YES' : 'no') : null],
    ['Throttled', s.throttle ? (s.throttle.now.throttled ? 'YES' : 'no') : null],
  ]);

  // memory
  const m = s.memory;
  if (m) {
    const pct = (m.used / m.total) * 100;
    const lvl = pctLevel(pct);
    setReadout('ro-mem', {
      value: fmtNum(pct, 0),
      level: lvl === 'good' ? null : lvl,
      ratio: pct / 100,
      cellTone: TONE[lvl],
      meta: `${fmtBytes(m.used)} of ${fmtBytes(m.total)}`,
    });
    kv('mem-list', [
      ['Used', fmtBytes(m.used)],
      ['Available', fmtBytes(m.available)],
      ['Total', fmtBytes(m.total)],
      ['Swap', m.swapTotal ? `${fmtBytes(m.swapUsed)} of ${fmtBytes(m.swapTotal)}` : 'off'],
    ]);
  } else {
    setReadout('ro-mem', { value: '--', level: null, ratio: null, meta: 'No reading' });
  }
  markFocus();

  // storage
  renderDisks(s);
  kv('disk-io', s.diskIo ? [['Disk read', fmtRate(s.diskIo.readBps)], ['Disk write', fmtRate(s.diskIo.writeBps)]] : []);

  // network
  setHtml($('net-ifaces'), s.network.length
    ? s.network.map((n) => `<tr><td>${esc(n.iface)}</td><td class="num">${fmtRate(n.rxBps)}</td><td class="num">${fmtRate(n.txBps)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="fg3">No interfaces.</td></tr>');
  const wifi = $('wifi');
  wifi.hidden = !s.wifi;
  if (s.wifi) {
    if (!wifi.firstElementChild) wifi.innerHTML = '<span class="bars-wrap" aria-hidden="true"></span><span class="data"></span>';
    signalBars(wifi.firstElementChild, s.wifi.quality / 20);
    wifi.lastElementChild.textContent = `${s.wifi.signalDbm} dBm`;
    wifi.setAttribute('aria-label', `Wi-Fi signal ${s.wifi.signalDbm} dBm, ${s.wifi.quality}%`);
  }
  kv('net-list', [
    s.wifi ? [`Wi-Fi (${s.wifi.iface})`, `${s.wifi.signalDbm} dBm (${s.wifi.quality}%)`] : null,
    ...sys.addresses.map((a) => [`IP ${a.iface}`, a.address]),
  ]);

  renderContainers(s.containers);
  renderConnections(s.connections);

  // system
  kv('sys-list', [
    ['Hostname', sys.hostname],
    ['Model', sys.model],
    ['OS', sys.os],
    ['Kernel', sys.kernel],
    ['Architecture', sys.arch],
    ['Uptime', fmtUptime(sys.uptimeSec)],
    ['Processes', sys.processes],
    ['Last update', `${utcDate(s.ts)} ${utcClock(s.ts)}`],
  ]);
}

function renderDisks(s) {
  const host = $('disks');
  if (!s.disks.length) {
    setHtml(host, '<p class="help">No block devices visible.</p>');
    return;
  }
  const key = s.disks.map((d) => `${d.mount}|${d.used}|${d.total}|${d.free}`).join(';');
  if (rendered.get(host) === key) return;
  rendered.set(host, key);
  host.innerHTML = s.disks.map((d) => {
    const pct = (d.used / d.total) * 100;
    const full = pct >= 90 ? badgeSm(pct >= 95 ? 'crit' : 'cau', pct >= 95 ? 'Full' : 'Nearly full') : '';
    return `<div class="disk">
      <div class="progress-head"><span class="data disk-mount">${esc(d.mount)} ${full}</span><span class="data fg2">${pct.toFixed(0)}% · ${fmtBytes(d.used)} / ${fmtBytes(d.total)}</span></div>
      <div class="progress" aria-label="${esc(d.mount)} used" data-pct="${pct}"></div>
      <span class="label">${fmtBytes(d.free)} free · ${esc(d.device)} · ${esc(d.fstype)}</span>
    </div>`;
  }).join('');
  host.querySelectorAll('.progress').forEach((el) => {
    const pct = Number(el.dataset.pct);
    progress(el, pct / 100, 32, pct >= 95 ? 'crit' : pct >= 90 ? 'cau' : undefined);
  });
}

const FLAGS = [
  ['underVoltage', 'Under-voltage', 'crit'],
  ['throttled', 'CPU throttled', 'crit'],
  ['freqCapped', 'Frequency capped', 'cau'],
  ['softTempLimit', 'Soft temp limit', 'cau'],
];
function renderFlags(s) {
  const t = s.throttle;
  $('flags-raw').textContent = t ? t.raw : '';
  if (!t && s.power.underVoltageNow == null) {
    setHtml($('flags'), `<tr><td colspan="3" class="fg3">${s.vcgencmd ? 'No flags reported.' : 'vcgencmd unavailable: no throttle flags.'}</td></tr>`);
    return;
  }
  setHtml($('flags'), FLAGS.map(([k, label, tone]) => {
    const now = k === 'underVoltage' ? (s.power.underVoltageNow ?? t?.now.underVoltage) : t?.now[k];
    const boot = t?.sinceBoot[k];
    const nowB = now == null ? badgeSm('off', 'n/a') : now ? badgeSm(tone, 'Active') : badgeSm('ok', 'No');
    const bootB = boot == null ? badgeSm('off', 'n/a') : boot ? badgeSm('cau', 'Seen') : badgeSm('ok', 'No');
    return `<tr><td>${esc(label)}</td><td>${nowB}</td><td>${bootB}</td></tr>`;
  }).join(''));
}

// --------------------------------------------------- containers & sockets
const STATE_TONE = { running: 'ok', paused: 'cau', stopping: 'cau', exited: 'crit', stopped: 'crit' };

function renderContainers(info) {
  const body = $('containers');
  const err = $('containers-error');
  if (!info || !info.available) {
    err.hidden = false;
    setHtml(err, `${iconHtml('info')}<div class="banner-text"><div class="banner-title">No container data</div><div class="banner-body">${esc(info?.error || 'Container information unavailable.')}</div></div>`);
    setHtml(body, '');
    $('containers-summary').textContent = '';
    return;
  }
  err.hidden = true;
  const running = info.list.filter((c) => c.state === 'running').length;
  const unhealthy = info.list.filter((c) => c.health === 'unhealthy').length;
  $('containers-summary').textContent =
    `${running} running` + (info.list.length > running ? ` · ${info.list.length - running} stopped` : '') +
    (unhealthy ? ` · ${unhealthy} unhealthy` : '');

  if (!info.list.length) {
    setHtml(body, '<tr><td colspan="7" class="fg3">No containers.</td></tr>');
    return;
  }
  const host = location.hostname;
  setHtml(body, info.list.map((c) => {
    const title = c.app ? `<b>${esc(c.app)}</b><span class="sub">${esc(c.name)}</span>` : `<b>${esc(c.name)}</b>`;
    let stateText = c.state;
    if (c.state !== 'running' && c.exitCode != null) stateText += ` (${c.exitCode})`;
    const healthTone = c.health === 'healthy' ? 'ok' : c.health === 'unhealthy' ? 'crit' : 'cau';
    const health = c.health ? badgeSm(healthTone, c.health) : '';
    const tone = c.state === 'running' && c.health === 'unhealthy' ? 'crit' : STATE_TONE[c.state] || 'off';
    const ports = c.ports.length
      ? c.ports.map((p) => p.protocol === 'tcp' && c.state === 'running'
          ? `<a href="http://${esc(host)}:${p.hostPort}/" target="_blank" rel="noopener">${p.hostPort}</a>${p.containerPort !== p.hostPort ? `<span class="fg3">→${p.containerPort}</span>` : ''}`
          : `${p.hostPort}/${esc(p.protocol)}`).join(', ') + (c.hostNetwork ? ' <span class="fg3">(host)</span>' : '')
      : (c.hostNetwork ? '<span class="fg3">host network</span>' : '--');
    const since = c.state === 'running' ? c.startedAt : c.finishedAt;
    const age = since ? fmtUptime(Math.max(0, (Date.now() - since) / 1000)) : '--';
    return `<tr>
      <td>${title}</td>
      <td><span class="badges">${badgeSm(tone, stateText)}${health}</span></td>
      <td>${ports}</td>
      <td>${c.state === 'running' ? age : `<span class="fg3">${age} ago</span>`}</td>
      <td class="num">${c.cpuPercent == null ? '--' : `${fmtNum(c.cpuPercent, 1)}%`}</td>
      <td class="num">${c.memoryBytes == null ? '--' : fmtBytes(c.memoryBytes)}</td>
      <td class="fg2">${esc((c.image || '--').replace(/^localhost\//, ''))}</td>
    </tr>`;
  }).join(''));
}

let showLoopback = false;
try { showLoopback = localStorage.getItem('pi-monitor-loopback') === '1'; } catch { /* ignore */ }
$('show-loopback').checked = showLoopback;
$('show-loopback').addEventListener('change', (e) => {
  showLoopback = e.target.checked;
  try { localStorage.setItem('pi-monitor-loopback', showLoopback ? '1' : '0'); } catch { /* ignore */ }
  if (state.snap) renderConnections(state.snap.connections);
});

const MAX_ROWS = 60;
function renderConnections(c) {
  if (!c) return;
  const stat = (n, label) => `<div><span class="label">${esc(label)}</span><span class="data stat-num">${n}</span></div>`;
  setHtml($('conn-stats'),
    stat(c.totalEstablished, 'Established') +
    stat(c.remoteHosts, 'Remote hosts') +
    stat(new Set(c.listening.filter((l) => !l.loopback).map((l) => l.port)).size, 'Open to LAN') +
    stat(c.counts.TIME_WAIT || 0, 'Time-wait'));

  // one row per port and service: IPv4 and IPv6 sockets are merged
  const groups = new Map();
  for (const l of c.listening) {
    if (!showLoopback && l.loopback) continue;
    const key = `${l.port}|${l.service}`;
    const g = groups.get(key) ?? { ...l, addresses: [] };
    g.addresses.push(l.address);
    groups.set(key, g);
  }
  const listening = [...groups.values()];
  setHtml($('listening'), listening.length
    ? listening.map((l) => `<tr><td class="num">${l.port}</td><td>${esc(l.addresses.join(', '))}</td><td>${esc(l.service || '--')}${l.container && l.process ? `<span class="sub">${esc(l.process)}</span>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="3" class="fg3">None.</td></tr>');

  const est = c.established.filter((e) => showLoopback || !e.loopback);
  const shown = est.slice(0, MAX_ROWS);
  setHtml($('established'), shown.length
    ? shown.map((e) => `<tr>
        <td>${e.direction === 'in' ? '↓ IN' : '↑ OUT'}</td>
        <td>${esc(e.remoteAddress)}:${e.remotePort}</td>
        <td class="num">${e.localPort}</td>
        <td>${esc(e.service || '--')}${e.process && e.process !== e.service ? `<span class="sub">${esc(e.process)}</span>` : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="fg3">No active connections.</td></tr>');
  const hidden = est.length - shown.length + (c.totalEstablished - c.established.length);
  $('established-more').hidden = hidden <= 0;
  $('established-more').textContent = `+ ${hidden} more not shown`;
}

// --------------------------------------------------------- health banners
let health = { crit: [], cau: [], past: '' };

function renderHealth(s) {
  const crit = [], cau = [], past = [];
  const t = s.throttle;
  const uv = s.power.underVoltageNow ?? t?.now.underVoltage;
  if (uv) crit.push('Under-voltage right now: the power supply cannot keep up.');
  if (t?.now.throttled) crit.push('CPU is throttled.');
  if (t?.now.freqCapped) cau.push('ARM frequency is capped.');
  if (t?.now.softTempLimit) cau.push('Soft temperature limit active.');
  const tl = tempLevel(s.temps.cpu);
  if (tl && tl !== 'good') (tl === 'warning' ? cau : crit).push(`CPU temperature is ${fmtNum(s.temps.cpu, 1)} °C.`);
  const vl = voltLevel(s.power.inputVolts);
  if (vl && vl !== 'good' && !uv) (vl === 'warning' ? cau : crit).push(`Input voltage is low (${fmtNum(s.power.inputVolts, 2)} V).`);
  for (const d of s.disks) {
    const pct = (d.used / d.total) * 100;
    if (pct >= 90) (pct >= 95 ? crit : cau).push(`${d.mount} is ${pct.toFixed(0)}% full.`);
  }
  if (s.power.usbOverCurrent) cau.push('USB over-current was detected.');
  for (const c of s.containers?.list ?? []) {
    const name = c.app || c.name;
    if (c.state === 'running' && c.health === 'unhealthy') cau.push(`${name} is unhealthy.`);
    else if (c.state !== 'running' && c.restartPolicy === 'always') cau.push(`${name} is not running (${c.state}).`);
  }
  if (t && !t.now.underVoltage && t.sinceBoot.underVoltage) past.push('under-voltage');
  if (t && !t.now.throttled && t.sinceBoot.throttled) past.push('throttling');
  if (t && !t.now.freqCapped && t.sinceBoot.freqCapped) past.push('frequency capping');
  const pastText = past.length
    ? `Since boot the firmware recorded ${past.join(' and ')}${s.power.psuMaxCurrentMa != null && s.power.psuMaxCurrentMa < 5000 ? `; the PSU only negotiated ${(s.power.psuMaxCurrentMa / 1000).toFixed(1)} A` : ''}.`
    : '';
  health = { crit, cau, past: pastText };
  renderNotices();
}

/** Pinned critical banner, caution/ok banners and the link-lost notice. */
function renderNotices() {
  const pinned = $('pinned');
  const { crit, cau, past } = health;
  setHtml(pinned, crit.length ? bannerHtml('crit', 'Attention needed', crit.join(' ')) : '');
  pinned.hidden = !crit.length;

  let html = '';
  if (state.link !== 'live') {
    const age = state.snap ? `Showing data from ${ago(state.snap.ts / 1000).toLowerCase()}.` : 'No data received yet.';
    html += state.link === 'error'
      ? bannerHtml('crit', 'No link to the monitor service', `${age} Retrying automatically.`)
      : bannerHtml('cau', state.link === 'connecting' ? 'Connecting to the monitor service' : 'Link lost, reconnecting', age);
  }
  if (state.snap) {
    if (cau.length) html += bannerHtml('cau', 'Check your Pi', cau.join(' '));
    if (past) html += bannerHtml('cau', 'Power problems since boot', past);
    if (!crit.length && !cau.length && !past) html += bannerHtml('ok', 'All systems normal', '');
  }
  setHtml($('notices'), html);
}

const EVENT_TEXT = {
  'under-voltage': ['Under-voltage', 'cleared', 'crit'],
  throttled: ['CPU throttled', 'ended', 'crit'],
  'freq-capped': ['Frequency capped', 'ended', 'cau'],
  'soft-temp-limit': ['Soft temperature limit', 'ended', 'cau'],
};
function renderEvents() {
  if (document.hidden) return;
  const list = [...state.events].reverse().slice(0, 100);
  setHtml($('events'), list.length
    ? list.map((e) => {
        const [name, endWord, tone] = EVENT_TEXT[e.kind] ?? [e.kind, 'ended', 'cau'];
        const t = e.active ? tone : 'ok';
        return `<li><div class="row static">${iconHtml(STATUS[t].icon, `i-${t}`)}<div class="row-main">` +
          `<span class="row-title">${esc(name)}${e.active ? '' : ` ${endWord}`}</span>` +
          `<span class="row-meta">${esc(utcDateTime(e.t))}</span></div>` +
          `<span class="row-value">${badgeSm(t, e.active ? 'Started' : endWord)}</span></div></li>`;
      }).join('')
    : '<li><div class="row static"><span class="row-main fg2 body-sm">No events recorded.</span></div></li>');
}

// --------------------------------------------------------------- live data
const BUCKET = 60e3;
function toPoint(s) {
  const net = s.network.reduce((a, n) => ({ rx: a.rx + n.rxBps, tx: a.tx + n.txBps }), { rx: 0, tx: 0 });
  return {
    t: s.ts,
    cpu: s.cpu.usage,
    temp: s.temps.cpu,
    volt: s.power.inputVolts,
    mem: s.memory ? (s.memory.used / s.memory.total) * 100 : null,
    rx: net.rx,
    tx: net.tx,
  };
}

const prevFlags = { value: null };
function trackEvents(s) {
  const f = s.throttle?.now;
  if (!f) return;
  const map = { underVoltage: 'under-voltage', throttled: 'throttled', freqCapped: 'freq-capped', softTempLimit: 'soft-temp-limit' };
  if (prevFlags.value) {
    for (const [k, kind] of Object.entries(map)) {
      if (f[k] !== prevFlags.value[k]) state.events.push({ t: s.ts, kind, active: f[k] });
    }
  }
  prevFlags.value = f;
}

setLink('connecting');
const socket = window.io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => setLink('live'));
socket.on('disconnect', () => setLink('reconnecting'));
socket.on('connect_error', () => setLink('error'));
socket.io.on('reconnect_attempt', () => { if (state.link !== 'error') setLink('reconnecting'); });

socket.on('init', (data) => {
  state.intervalMs = data.intervalMs;
  state.live = data.live;
  state.minutes = data.minutes;
  state.events = data.events;
  prevFlags.value = data.snapshot?.throttle?.now ?? null;
  render(data.snapshot);
  renderEvents();
  redrawCharts();
});

socket.on('snapshot', (s) => {
  const pt = toPoint(s);
  state.live.push(pt);
  while (state.live.length && state.live[0].t < s.ts - LIVE_WINDOW) state.live.shift();
  // fold the sample into the current minute (rough client-side mirror of
  // the server's aggregation; reloading gets the exact server series)
  const last = state.minutes.at(-1);
  const b = Math.floor(s.ts / BUCKET) * BUCKET;
  if (!last || last.t !== b) state.minutes.push({ ...pt, t: b });
  else for (const k of ['cpu', 'mem', 'rx', 'tx']) if (pt[k] != null) last[k] = last[k] == null ? pt[k] : (last[k] + pt[k]) / 2;
  if (last && last.t === b) {
    if (pt.temp != null) last.temp = Math.max(last.temp ?? -Infinity, pt.temp);
    if (pt.volt != null) last.volt = Math.min(last.volt ?? Infinity, pt.volt);
  }
  while (state.minutes.length && state.minutes[0].t < s.ts - 864e5) state.minutes.shift();
  trackEvents(s);
  render(s);
  renderEvents();
  redrawCharts();
});

// keep the data age current while the link is down
setInterval(() => {
  if (state.link !== 'live') { updateStrip(); renderNotices(); }
}, 5000);

// pause rendering while hidden; catch up when shown again
onVisibility((visible) => {
  if (!visible) return;
  render(state.snap);
  renderEvents();
  redrawCharts();
});

// ------------------------------------------------------------ range toggle
document.querySelectorAll('[data-range]').forEach((btn) => {
  btn.setAttribute('aria-pressed', String(btn.dataset.range === state.range));
  btn.addEventListener('click', () => {
    state.range = btn.dataset.range;
    try { localStorage.setItem('pi-monitor-range', state.range); } catch { /* ignore */ }
    document.querySelectorAll('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    redrawCharts();
  });
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redrawCharts, 100);
});
