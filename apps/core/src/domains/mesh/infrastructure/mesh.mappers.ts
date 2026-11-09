import type { Conversation, MeshConfig, MeshMessage, MeshNode, RadioStatus } from '../domain/mesh.dto';

/** snake_case JSON from the mesh container -> camelCase domain objects. */
type Raw = Record<string, unknown>;

const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelize<T>(raw: Raw): T {
  const out: Raw = {};
  for (const [k, v] of Object.entries(raw)) out[camel(k)] = v;
  return out as T;
}

export const toNode = (raw: Raw) => camelize<MeshNode>(raw);
export const toMessage = (raw: Raw) => camelize<MeshMessage>(raw);
export const toConversation = (raw: Raw) => camelize<Conversation>(raw);

export function toStatus(raw: Raw): RadioStatus {
  const s = camelize<RadioStatus & { config?: Raw }>(raw);
  s.channels ??= [];
  if (raw.config) {
    const c = raw.config as Raw;
    s.config = {
      sendPinRequired: !!c.send_pin_required,
      maxTextBytes: Number(c.max_text_bytes) || 0,
      rateLimit: (c.rate_limit as MeshConfig['rateLimit']) ?? { count: 0, window: 0 },
    };
  }
  return s;
}
