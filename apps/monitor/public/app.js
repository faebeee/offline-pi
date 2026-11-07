/* Pi Monitor dashboard: renders snapshots pushed over Socket.IO. No build
 * step and no external dependencies, so it works fully offline. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    range: 'live',
    live: [],
    minutes: [],
    events: [],
    snap: null,
    intervalMs: 2000,
  };
  const LIVE_WINDOW = 15 * 60e3;

  try {
    const saved = localStorage.getItem('pi-monitor-range');
    if (saved === 'live' || saved === 'day') state.range = saved;
  } catch { /* storage unavailable */ }

  // ------------------------------------------------------------ formatting
  const fmtBytes = (n, digits = 1) => {
    if (n == null || !Number.isFinite(n)) return '–';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (Math.abs(n) >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
  };
  const fmtRate = (n) => (n == null ? '–' : `${fmtBytes(n)}/s`);
  const fmtNum = (n, d = 1) => (n == null || !Number.isFinite(n) ? '–' : n.toFixed(d));
  const fmtUptime = (s) => {
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
  };
  const fmtTime = (t, withDate) => new Date(t).toLocaleString([], withDate
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ thresholds
  const levelFor = (v, warn, serious, crit, lowerIsWorse = false) => {
    if (v == null) return null;
    const worse = (a, b) => (lowerIsWorse ? a <= b : a >= b);
    if (worse(v, crit)) return 'critical';
    if (worse(v, serious)) return 'serious';
    if (worse(v, warn)) return 'warning';
    return 'good';
  };
  const SEV_LABEL = { good: 'Normal', warning: 'Elevated', serious: 'High', critical: 'Critical' };
  const tempLevel = (c) => levelFor(c, 70, 80, 85);
  const voltLevel = (v) => levelFor(v, 4.85, 4.75, 4.65, true);
  const pctLevel = (p) => levelFor(p, 80, 90, 95);

  function setHero(id, text, level, labelOverride) {
    const el = $(id);
    el.textContent = text;
    const hero = el.parentElement;
    let badge = hero.querySelector('.sev');
    if (!level) { badge?.remove(); return; }
    if (!badge) { badge = document.createElement('span'); hero.appendChild(badge); }
    badge.className = `sev ${level}`;
    badge.textContent = labelOverride || SEV_LABEL[level];
  }

  function setMeter(el, pct, level) {
    el.dataset.level = level && level !== 'good' ? level : '';
    el.firstElementChild.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.setAttribute('aria-valuenow', String(Math.round(pct || 0)));
  }

  function kv(id, rows) {
    $(id).innerHTML = rows
      .filter((r) => r && r[1] != null && r[1] !== '')
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
      .join('');
  }

  // ---------------------------------------------------------------- charts
  const charts = {};
  const tooltip = $('tooltip');

  /**
   * Minimal SVG line chart with a crosshair tooltip.
   * series: [{ key, label, color (css var), fmt }]
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
    const pad = { l: 38, r: 8, t: 6, b: 18 };
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

  function draw(chart) {
    const { w, h, pad, t0, t1, lo, hi, x, y } = scales(chart);
    if (!w || !h) return;
    const fmtAxis = chart.opts.axisFmt || ((v) => fmtNum(v, 0));
    let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(chart.opts.label || '')}">`;
    for (let i = 0; i <= 2; i++) {
      const v = lo + ((hi - lo) * i) / 2, yy = y(v);
      svg += `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}"/>`;
      svg += `<text class="axis" x="${pad.l - 6}" y="${yy + 3}" text-anchor="end">${esc(fmtAxis(v))}</text>`;
    }
    const withDate = state.range === 'day';
    svg += `<text class="axis" x="${pad.l}" y="${h - 4}">${esc(fmtTime(t0, withDate).replace(/:\d\d$/, ''))}</text>`;
    svg += `<text class="axis" x="${w - pad.r}" y="${h - 4}" text-anchor="end">now</text>`;

    if (!chart.points.length) {
      svg += `<text class="empty" x="${w / 2}" y="${h / 2}" text-anchor="middle">Collecting data…</text>`;
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
      const d = segs.map((seg) => 'M' + seg.map((q) => q.join(',')).join('L')).join('');
      if (chart.series.length === 1) {
        const base = y(lo).toFixed(1);
        const area = segs.map((seg) => `M${seg[0][0]},${base}L${seg.map((q) => q.join(',')).join('L')}L${seg.at(-1)[0]},${base}Z`).join('');
        svg += `<path class="area" fill="var(${s.color})" d="${area}"/>`;
      }
      svg += `<path class="line" stroke="var(${s.color})" d="${d}"/>`;
      if (chart.series.length > 1) {
        const lp = segs.at(-1).at(-1);
        svg += `<circle cx="${lp[0]}" cy="${lp[1]}" r="3" fill="var(${s.color})" stroke="var(--surface)" stroke-width="2"/>`;
      }
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
    svg.querySelector('.hover')?.remove();
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'hover');
    const bx = x(best.t);
    let inner = `<line class="cross" x1="${bx}" x2="${bx}" y1="${pad.t}" y2="${h - pad.b}"/>`;
    for (const s of chart.series) {
      const v = best[s.key];
      if (v != null) inner += `<circle cx="${bx}" cy="${y(v)}" r="4" fill="var(${s.color})" stroke="var(--surface)" stroke-width="2"/>`;
    }
    g.innerHTML = inner;
    svg.appendChild(g);

    tooltip.innerHTML = `<div class="t">${esc(fmtTime(best.t, state.range === 'day'))}</div>` +
      chart.series.map((s) => `<div><i style="background:var(${s.color})"></i>${esc(s.label)}: <b>${esc(s.fmt(best[s.key]))}</b></div>`).join('');
    tooltip.hidden = false;
    const tw = tooltip.offsetWidth;
    let left = e.clientX + 14;
    if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 14;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, rect.top + 4)}px`;
  }

  function redrawCharts() {
    const pts = state.range === 'live' ? state.live : state.minutes;
    for (const c of Object.values(charts)) { c.points = pts; draw(c); }
  }

  const unitFmt = (unit, d) => (v) => (v == null ? '–' : `${fmtNum(v, d)} ${unit}`);
  lineChart('chart-temp', [{ key: 'temp', label: 'CPU temperature', color: '--series-1', fmt: unitFmt('°C', 1) }],
    { label: 'CPU temperature over time', minSpan: 10 });
  lineChart('chart-volt', [{ key: 'volt', label: 'Input voltage', color: '--series-1', fmt: unitFmt('V', 3) }],
    { label: 'Input voltage over time', minSpan: 0.2, axisFmt: (v) => v.toFixed(2) });
  lineChart('chart-cpu', [{ key: 'cpu', label: 'CPU usage', color: '--series-1', fmt: unitFmt('%', 1) }],
    { label: 'CPU usage over time', min: 0, ceil: 100 });
  lineChart('chart-mem', [{ key: 'mem', label: 'Memory used', color: '--series-1', fmt: unitFmt('%', 1) }],
    { label: 'Memory usage over time', min: 0, ceil: 100 });
  lineChart('chart-net', [
    { key: 'rx', label: 'Download', color: '--series-1', fmt: fmtRate },
    { key: 'tx', label: 'Upload', color: '--series-2', fmt: fmtRate },
  ], { label: 'Network throughput over time', min: 0, minSpan: 1024, axisFmt: (v) => fmtBytes(v, 0) });

  // -------------------------------------------------------------- rendering
  function render(s) {
    if (!s) return;
    state.snap = s;
    const sys = s.system;
    $('hostname').textContent = sys.hostname;
    $('model').textContent = sys.model || 'Unknown hardware';
    document.title = `${sys.hostname} · Pi Monitor`;

    renderHealth(s);

    // temperature
    const tc = s.temps.cpu;
    setHero('temp-value', fmtNum(tc, 1), tempLevel(tc));
    setMeter($('temp-meter'), tc == null ? 0 : (tc / 90) * 100, tempLevel(tc));
    kv('temp-list', [
      ...s.temps.sensors.filter((x) => x.name !== 'CPU').map((x) => [x.name, `${fmtNum(x.celsius, 1)} °C`]),
      s.fan ? ['Fan', `${s.fan.rpm} rpm${s.fan.pwmPercent != null ? ` (${s.fan.pwmPercent}%)` : ''}`] : ['Fan', 'not detected'],
      ['Soft temp limit', s.throttle ? (s.throttle.now.softTempLimit ? 'active' : 'inactive') : null],
    ]);

    // power
    const p = s.power;
    if (p.inputVolts != null) {
      $('volt-unit').textContent = 'V input (5 V rail)';
      setHero('volt-value', fmtNum(p.inputVolts, 2), voltLevel(p.inputVolts),
        voltLevel(p.inputVolts) === 'good' ? 'Normal' : 'Low');
    } else if (p.coreVolts != null) {
      $('volt-unit').textContent = 'V core';
      setHero('volt-value', fmtNum(p.coreVolts, 3), null);
    } else {
      $('volt-unit').textContent = 'V';
      setHero('volt-value', '–', null);
    }
    const uv = p.underVoltageNow ?? s.throttle?.now.underVoltage;
    kv('power-list', [
      ['Under-voltage now', uv == null ? null : uv ? 'YES' : 'no'],
      ['Under-voltage since boot', s.throttle ? (s.throttle.sinceBoot.underVoltage ? 'yes' : 'no') : null],
      ['Core voltage', p.inputVolts != null && p.coreVolts != null ? `${fmtNum(p.coreVolts, 3)} V` : null],
      ['Board power (PMIC)', p.socWatts != null ? `${fmtNum(p.socWatts, 2)} W` : null],
      ['PSU max current', p.psuMaxCurrentMa != null ? `${(p.psuMaxCurrentMa / 1000).toFixed(1)} A${p.psuMaxCurrentMa < 5000 ? ' (not 5 A)' : ''}` : null],
      ['USB current limit', p.usbHighCurrent == null ? null : p.usbHighCurrent ? '1.6 A' : '600 mA'],
      ['USB over-current', p.usbOverCurrent == null ? null : p.usbOverCurrent ? 'detected' : 'no'],
      ['Throttle flags', s.throttle?.raw],
      !s.vcgencmd ? ['vcgencmd', 'unavailable'] : null,
    ]);
    $('rails-wrap').hidden = !p.rails.length;
    $('rails').innerHTML = p.rails.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.volts, 3)}</td><td>${fmtNum(r.amps, 3)}</td><td>${r.volts != null && r.amps != null ? fmtNum(r.volts * r.amps, 2) : '–'}</td></tr>`).join('');
    $('chart-volt').hidden = p.inputVolts == null;

    // cpu
    setHero('cpu-value', fmtNum(s.cpu.usage, 0), null);
    $('cores').innerHTML = s.cpu.cores.map((c, i) =>
      `<div class="core">Core ${i} <b>${fmtNum(c, 0)}%</b><div class="meter" data-level="${pctLevel(c) === 'good' ? '' : pctLevel(c)}"><span style="width:${c}%"></span></div>${s.cpu.freqMhz[i] ? `${s.cpu.freqMhz[i]} MHz` : ''}</div>`).join('');
    kv('cpu-list', [
      ['Load (1/5/15 min)', s.cpu.load.map((l) => l.toFixed(2)).join(' / ')],
      ['Max frequency', s.cpu.maxFreqMhz ? `${s.cpu.maxFreqMhz} MHz` : null],
      ['Frequency capped', s.throttle ? (s.throttle.now.freqCapped ? 'yes' : 'no') : null],
      ['Throttled', s.throttle ? (s.throttle.now.throttled ? 'yes' : 'no') : null],
    ]);

    // memory
    const m = s.memory;
    if (m) {
      const pct = (m.used / m.total) * 100;
      setHero('mem-value', fmtNum(pct, 0), pctLevel(pct) === 'good' ? null : pctLevel(pct));
      $('mem-unit').textContent = `% of ${fmtBytes(m.total)}`;
      setMeter($('mem-meter'), pct, pctLevel(pct));
      kv('mem-list', [
        ['Used', fmtBytes(m.used)],
        ['Available', fmtBytes(m.available)],
        ['Swap', m.swapTotal ? `${fmtBytes(m.swapUsed)} of ${fmtBytes(m.swapTotal)}` : 'off'],
      ]);
    }

    // storage
    $('disks').innerHTML = s.disks.length ? s.disks.map((d) => {
      const pct = (d.used / d.total) * 100, lvl = pctLevel(pct);
      return `<div class="disk"><div class="disk-head"><span><b>${esc(d.mount)}</b></span><span>${fmtBytes(d.free)} free</span></div>
        <div class="meter" data-level="${lvl === 'good' ? '' : lvl}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${esc(d.mount)} used"><span style="width:${pct}%"></span></div>
        <small>${fmtBytes(d.used)} of ${fmtBytes(d.total)} used (${pct.toFixed(0)}%) · ${esc(d.device)} · ${esc(d.fstype)}</small></div>`;
    }).join('') : '<p class="muted">No block devices visible.</p>';
    kv('disk-io', s.diskIo ? [['Disk read', fmtRate(s.diskIo.readBps)], ['Disk write', fmtRate(s.diskIo.writeBps)]] : []);

    // network
    kv('net-list', [
      ...s.network.map((n) => [n.iface, `↓ ${fmtRate(n.rxBps)}  ↑ ${fmtRate(n.txBps)}`]),
      s.wifi ? ['Wi-Fi signal', `${s.wifi.signalDbm} dBm (${s.wifi.quality}%)`] : null,
      ...sys.addresses.map((a) => [`IP (${a.iface})`, a.address]),
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
      ['Last update', fmtTime(s.ts)],
    ]);
  }

  // ------------------------------------------------- containers & sockets
  const STATE_LEVEL = { running: 'good', paused: 'warning', stopping: 'warning', exited: 'critical', stopped: 'critical' };

  function renderContainers(info) {
    const body = $('containers');
    const err = $('containers-error');
    if (!info || !info.available) {
      err.hidden = false;
      err.textContent = info?.error || 'Container information unavailable.';
      body.innerHTML = '';
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
      body.innerHTML = '<tr class="empty-row"><td colspan="7">No containers.</td></tr>';
      return;
    }
    const host = location.hostname;
    body.innerHTML = info.list.map((c) => {
      const title = c.app ? `<b>${esc(c.app)}</b><span class="sub mono">${esc(c.name)}</span>` : `<b>${esc(c.name)}</b>`;
      let stateText = c.state;
      if (c.state !== 'running' && c.exitCode != null) stateText += ` (${c.exitCode})`;
      const healthLevel = c.health === 'healthy' ? 'good' : c.health === 'unhealthy' ? 'critical' : 'warning';
      const health = c.health ? `<span class="badge ${healthLevel}">${esc(c.health)}</span>` : '';
      const level = c.state === 'running' && c.health === 'unhealthy' ? 'critical' : STATE_LEVEL[c.state] || '';
      const ports = c.ports.length
        ? c.ports.map((p) => p.protocol === 'tcp' && c.state === 'running'
            ? `<a href="http://${esc(host)}:${p.hostPort}/" target="_blank" rel="noopener">${p.hostPort}</a>${p.containerPort !== p.hostPort ? `<span class="muted">→${p.containerPort}</span>` : ''}`
            : `${p.hostPort}/${esc(p.protocol)}`).join(', ') + (c.hostNetwork ? ' <span class="muted">(host)</span>' : '')
        : (c.hostNetwork ? '<span class="muted">host network</span>' : '–');
      const since = c.state === 'running' ? c.startedAt : c.finishedAt;
      const age = since ? fmtUptime(Math.max(0, (Date.now() - since) / 1000)) : '–';
      return `<tr>
        <td>${title}</td>
        <td><span class="badge ${level}">${esc(stateText)}</span>${health ? `<span class="sub">${health}</span>` : ''}</td>
        <td>${ports}</td>
        <td>${c.state === 'running' ? age : `<span class="muted">${age} ago</span>`}</td>
        <td class="num">${c.cpuPercent == null ? '–' : `${fmtNum(c.cpuPercent, 1)}%`}</td>
        <td class="num">${c.memoryBytes == null ? '–' : fmtBytes(c.memoryBytes)}</td>
        <td><span class="mono">${esc((c.image || '–').replace(/^localhost\//, ''))}</span></td>
      </tr>`;
    }).join('');
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
    const stat = (n, label) => `<div class="stat"><b>${n}</b><span>${esc(label)}</span></div>`;
    $('conn-stats').innerHTML =
      stat(c.totalEstablished, 'established') +
      stat(c.remoteHosts, 'remote hosts') +
      stat(new Set(c.listening.filter((l) => !l.loopback).map((l) => l.port)).size, 'ports open to LAN') +
      stat(c.counts.TIME_WAIT || 0, 'time-wait');

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
    $('listening').innerHTML = listening.length
      ? listening.map((l) => `<tr><td class="num">${l.port}</td><td class="mono">${esc(l.addresses.join(', '))}</td><td>${esc(l.service || '–')}${l.container && l.process ? `<span class="sub">${esc(l.process)}</span>` : ''}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="3">None.</td></tr>';

    const est = c.established.filter((e) => showLoopback || !e.loopback);
    const shown = est.slice(0, MAX_ROWS);
    $('established').innerHTML = shown.length
      ? shown.map((e) => `<tr>
          <td>${e.direction === 'in' ? '↓ in' : '↑ out'}</td>
          <td class="mono">${esc(e.remoteAddress)}:${e.remotePort}</td>
          <td class="num">${e.localPort}</td>
          <td>${esc(e.service || '–')}${e.process && e.process !== e.service ? `<span class="sub">${esc(e.process)}</span>` : ''}</td>
        </tr>`).join('')
      : '<tr class="empty-row"><td colspan="4">No active connections.</td></tr>';
    const hidden = est.length - shown.length + (c.totalEstablished - c.established.length);
    $('established-more').hidden = hidden <= 0;
    $('established-more').textContent = `+ ${hidden} more not shown`;
  }

  function renderHealth(s) {
    const issues = [], past = [];
    const t = s.throttle;
    const uv = s.power.underVoltageNow ?? t?.now.underVoltage;
    if (uv) issues.push(['critical', 'Under-voltage right now: the power supply cannot keep up.']);
    if (t?.now.throttled) issues.push(['critical', 'CPU is throttled.']);
    if (t?.now.freqCapped) issues.push(['warning', 'ARM frequency is capped.']);
    if (t?.now.softTempLimit) issues.push(['warning', 'Soft temperature limit active.']);
    const tl = tempLevel(s.temps.cpu);
    if (tl && tl !== 'good') issues.push([tl === 'warning' ? 'warning' : 'critical', `CPU temperature is ${fmtNum(s.temps.cpu, 1)} °C.`]);
    const vl = voltLevel(s.power.inputVolts);
    if (vl && vl !== 'good' && !uv) issues.push([vl === 'warning' ? 'warning' : 'critical', `Input voltage is low (${fmtNum(s.power.inputVolts, 2)} V).`]);
    for (const d of s.disks) {
      const pct = (d.used / d.total) * 100;
      if (pct >= 90) issues.push([pct >= 95 ? 'critical' : 'warning', `${d.mount} is ${pct.toFixed(0)}% full.`]);
    }
    if (s.power.usbOverCurrent) issues.push(['warning', 'USB over-current was detected.']);
    for (const c of s.containers?.list ?? []) {
      const name = c.app || c.name;
      if (c.state === 'running' && c.health === 'unhealthy') issues.push(['warning', `${name} is unhealthy.`]);
      else if (c.state !== 'running' && c.restartPolicy === 'always') issues.push(['warning', `${name} is not running (${c.state}).`]);
    }
    if (t && !t.now.underVoltage && t.sinceBoot.underVoltage) past.push('under-voltage');
    if (t && !t.now.throttled && t.sinceBoot.throttled) past.push('throttling');
    if (t && !t.now.freqCapped && t.sinceBoot.freqCapped) past.push('frequency capping');

    let level = 'good', title = 'All systems normal', detail = '';
    if (issues.length) {
      level = issues.some((i) => i[0] === 'critical') ? 'critical' : 'warning';
      title = level === 'critical' ? 'Attention needed' : 'Check your Pi';
      detail = issues.map((i) => i[1]).join(' ');
    }
    if (past.length) {
      if (level === 'good') { level = 'warning'; title = 'Power problems since boot'; }
      detail += `${detail ? ' ' : ''}Since boot the firmware recorded ${past.join(' and ')}${s.power.psuMaxCurrentMa != null && s.power.psuMaxCurrentMa < 5000 ? `; the PSU only negotiated ${(s.power.psuMaxCurrentMa / 1000).toFixed(1)} A` : ''}.`;
    }
    $('health').dataset.level = level;
    $('health-title').textContent = title;
    $('health-detail').textContent = detail;
  }

  const EVENT_TEXT = {
    'under-voltage': ['Under-voltage', 'cleared'],
    throttled: ['CPU throttled', 'ended'],
    'freq-capped': ['Frequency capped', 'ended'],
    'soft-temp-limit': ['Soft temperature limit', 'ended'],
  };
  function renderEvents() {
    const list = [...state.events].reverse().slice(0, 100);
    $('events').innerHTML = list.length
      ? list.map((e) => `<li><time>${esc(fmtTime(e.t, true))}</time><span>${e.active ? '⚠ ' : ''}${esc(EVENT_TEXT[e.kind]?.[0] ?? e.kind)}${e.active ? '' : ` ${EVENT_TEXT[e.kind]?.[1] ?? 'ended'}`}</span></li>`).join('')
      : '<li class="empty">No events recorded.</li>';
  }

  // -------------------------------------------------------------- live data
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

  const socket = io({ transports: ['websocket', 'polling'] });
  const conn = $('conn');
  const setConn = (st, label) => { conn.dataset.state = st; conn.querySelector('.label').textContent = label; };

  socket.on('connect', () => setConn('live', 'Live'));
  socket.on('disconnect', () => setConn('offline', 'Disconnected'));
  socket.io.on('reconnect_attempt', () => setConn('connecting', 'Reconnecting'));

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

  // ---------------------------------------------------------- range toggle
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
})();
