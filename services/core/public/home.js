/* Home (Hub): every installed module as a tile (open it) and a switch
 * (start/stop it). State comes from core's /api/modules, refreshed every
 * few seconds; no build step, no external dependencies. */
import { frame, iconHtml, badgeHtml, escapeHtml as esc } from '/ui/outpost.js';
import { fetchModules, controlModule } from '/modules.js';

const { strip } = frame('home');
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const wanted = params.get('module'); // set when a stopped/missing module was opened
const pending = new Map(); // module id -> 'start' | 'stop'
let data = null;

const rendered = new WeakMap();
function setHtml(el, html) {
  if (rendered.get(el) !== html) { el.innerHTML = html; rendered.set(el, html); }
}

/** state badge + one mono status line for a module */
function describe(m) {
  if (!m.optional) return { tone: 'ok', badge: 'Running', line: 'Always on' };
  if (!m.installed) return { tone: 'off', badge: 'Not installed', line: 'Add with ./install.sh' };
  const busy = pending.get(m.id) || m.busy;
  if (busy) return { tone: 'cau', badge: busy === 'start' ? 'Starting' : 'Stopping', line: '' };
  if (m.missing.length) return { tone: 'cau', badge: 'Not configured', line: 'Run ./install.sh' };
  if (m.state === 'missing') return { tone: 'crit', badge: 'No container', line: 'Run ./start.sh' };
  if (m.state === 'running') {
    if (m.health === 'unhealthy') return { tone: 'crit', badge: 'Unhealthy', line: 'Running' };
    if (m.health === 'starting') return { tone: 'cau', badge: 'Starting', line: 'Running' };
    return { tone: 'ok', badge: 'Running', line: m.enabled ? 'On' : 'On (switched off)' };
  }
  if (m.enabled) return { tone: 'crit', badge: 'Stopped', line: m.error || 'Switched on but not running' };
  return { tone: 'off', badge: 'Off', line: 'Switched off' };
}

function render() {
  if (!data) return;
  const mods = data.modules.filter((m) => m.installed || m.optional);

  setHtml($('hub'), mods.filter((m) => m.installed).map((m) => {
    const d = describe(m);
    const off = m.optional && m.state !== 'running';
    return `<a class="tile${off ? ' is-off' : ''}" href="${esc(off ? `?module=${encodeURIComponent(m.id)}` : m.path)}">
      <div class="tile-head">${iconHtml(m.icon)}${badgeHtml(d.tone, d.badge, 'badge-sm')}</div>
      <div><div class="tile-name">${esc(m.label)}</div><div class="label">${esc(m.description || d.line)}</div></div>
    </a>`;
  }).join(''));

  const optional = mods.filter((m) => m.optional);
  const running = optional.filter((m) => m.installed && m.state === 'running').length;
  $('control-summary').textContent = `${running} of ${optional.filter((m) => m.installed).length} running`;

  setHtml($('switches'), optional.map((m) => {
    const d = describe(m);
    const busy = pending.has(m.id) || !!m.busy;
    const can = data.control && m.installed && !m.missing.length && !busy;
    const why = !m.installed ? 'Not installed: add it with ./install.sh'
      : m.missing.length ? `Not configured (${m.missing.join(', ')}): run ./install.sh`
      : !data.control ? data.controlError : d.line;
    return `<div class="switch-row">
      <div class="row-main">
        <div class="row-title">${esc(m.label)} ${badgeHtml(d.tone, d.badge, 'badge-sm')}</div>
        <div class="row-meta body-sm fg2">${esc(why || '')}</div>
      </div>
      <button type="button" class="switch" role="switch" data-id="${esc(m.id)}"
        aria-checked="${m.installed && m.enabled ? 'true' : 'false'}" aria-label="${esc(m.label)}"
        ${can ? '' : 'disabled'}></button>
    </div>`;
  }).join(''));

  renderNotice();
}

/** banner when a stopped or missing module was opened (/maps/ -> /?module=maps) */
function renderNotice() {
  const m = wanted && data.modules.find((x) => x.id === wanted);
  if (!m || (m.state === 'running' && m.installed)) {
    if (m && m.state === 'running') location.replace(m.path); // it's up now: go there
    setHtml($('notice'), '');
    return;
  }
  const title = !m.installed ? `${m.label} is not installed` : `${m.label} is not running`;
  const body = !m.installed ? 'Add it by re-running ./install.sh on the Pi.'
    : m.missing.length ? 'It needs to be configured first: run ./install.sh on the Pi.'
    : 'Start it here; the page opens as soon as it is up.';
  const btn = m.installed && !m.missing.length && data.control
    ? `<button type="button" class="btn btn-primary" data-start="${esc(m.id)}" ${pending.has(m.id) ? 'disabled' : ''}>${pending.has(m.id) ? 'Starting…' : `Start ${esc(m.label)}`}</button>`
    : '';
  setHtml($('notice'), `<div class="banner banner-info">${iconHtml('info')}<div class="banner-text">
    <div class="banner-title">${esc(title)}</div><div class="banner-body">${esc(body)}</div></div>${btn}</div>`);
}

async function act(id, action) {
  pending.set(id, action);
  $('control-error').hidden = true;
  render();
  try {
    await controlModule(id, action);
  } catch (err) {
    const el = $('control-error');
    el.hidden = false;
    const m = data.modules.find((x) => x.id === id);
    setHtml(el, `${iconHtml('critical')}<div class="banner-text"><div class="banner-title">Could not ${esc(action)} ${esc(m?.label || id)}</div><div class="banner-body">${esc(err.message)}</div></div>`);
  } finally {
    pending.delete(id);
    await refresh();
  }
}

$('switches').addEventListener('click', (e) => {
  const sw = e.target.closest('button.switch');
  if (!sw || sw.disabled) return;
  void act(sw.dataset.id, sw.getAttribute('aria-checked') === 'true' ? 'stop' : 'start');
});
$('notice').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-start]');
  if (b) void act(b.dataset.start, 'start');
});

async function refresh() {
  try {
    data = await fetchModules();
    strip?.setLink('ok', 'CORE · LIVE');
    render();
  } catch {
    strip?.setLink('crit', 'CORE · OFFLINE');
  }
}

void refresh();
setInterval(refresh, 4000);
