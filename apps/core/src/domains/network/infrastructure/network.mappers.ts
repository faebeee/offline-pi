import type { HotspotClient, HotspotState, NetworkStatus, StationInfo } from '../domain/network.dto';

/** snake_case JSON from the network container -> camelCase domain objects. */
type Raw = Record<string, unknown>;

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelize<T>(raw: Raw): T {
  const out: Raw = {};
  for (const [k, v] of Object.entries(raw)) out[camel(k)] = v;
  return out as T;
}

export function toStatus(raw: Raw): NetworkStatus {
  const s = camelize<NetworkStatus>(raw);
  s.enforcer = camelize((raw.enforcer as Raw | undefined) ?? { installed: false, pending: true });
  s.hotspot = toHotspot((raw.hotspot as Raw | undefined) ?? { active: false, helper: false, pending: false });
  return s;
}

export function toHotspot(raw: Raw): HotspotState {
  return camelize<HotspotState>(raw);
}

/** CLIENT_IP: the browser's address, to mark its own device. */
export function toClient(raw: Raw, clientIp?: string): HotspotClient {
  const c = camelize<HotspotClient>(raw);
  c.station = raw.station ? camelize<StationInfo>(raw.station as Raw) : null;
  c.you = !!clientIp && c.ip === clientIp;
  return c;
}
