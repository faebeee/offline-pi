/* Module state and start/stop, shared by the home page and the System
 * module. Talks to core's /api/modules (same origin). */

const PIN_KEY = 'offline-pi-control-pin';

/** { control, controlError, pinRequired, modules: [...] } */
export async function fetchModules() {
  const res = await fetch('/api/modules', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function storedPin() {
  try { return sessionStorage.getItem(PIN_KEY) || ''; } catch { return ''; }
}
function storePin(pin) {
  try { pin ? sessionStorage.setItem(PIN_KEY, pin) : sessionStorage.removeItem(PIN_KEY); } catch { /* ignore */ }
}

/**
 * Start or stop a module. Asks for the control PIN when core wants one
 * (CONTROL_PIN) and remembers it for this browser tab. Resolves to the
 * module's new status; throws with core's message on failure.
 */
export async function controlModule(id, action, { askPin = (msg) => window.prompt(msg) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const headers = { 'X-Pi-Monitor': '1' };
    const pin = storedPin();
    if (pin) headers['X-Control-Pin'] = pin;
    const res = await fetch(`/api/modules/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data.module;
    if (res.status === 403 && /PIN/.test(data.message || '')) {
      storePin('');
      const entered = askPin(pin ? 'Wrong PIN. Control PIN:' : 'Control PIN (CONTROL_PIN in .env):');
      if (!entered) throw new Error('Cancelled: a PIN is needed to start or stop modules.');
      storePin(entered);
      continue;
    }
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  throw new Error('Wrong PIN.');
}
