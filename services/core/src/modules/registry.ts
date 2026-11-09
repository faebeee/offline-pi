import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** services/<name>/module.json, copied into the image as MODULES_DIR by core_prepare. */
const MODULES_DIR = process.env.MODULES_DIR ?? join(process.cwd(), 'modules');

/** One entry of a module.json manifest, as documented in the root AGENTS.md. */
export interface Module {
  id: string;
  num: number;
  label: string;
  icon: string;
  description: string;
  /** compose service name; the container is offline-pi-<service> */
  service: string;
  /** public path under core, e.g. /maps/ (always has a trailing slash) */
  path: string;
  /** .env var holding the module's internal port (absent = not proxied, e.g. core itself) */
  portEnv?: string;
  /** true = strip the path prefix before forwarding (false keeps it, e.g. kiwix) */
  stripPrefix?: boolean;
  /** path on the module to probe for its container health, relative to its own root */
  health?: string;
  /** *_DIR env vars it bind-mounts */
  dirs: string[];
  /** false = always installed and running (core itself) */
  optional: boolean;
  /** env vars that must be non-empty before it may start */
  requires: string[];
  /** installed modules started with it, in order */
  dependsOn: string[];
  /** podman container name, offline-pi-<service> */
  containerName: string;
  /** http://MODULES_BIND_ADDRESS:<port>, only when portEnv resolves to a port */
  upstream: string | null;
}

function bindAddress(): string {
  return process.env.MODULES_BIND_ADDRESS || '127.0.0.1';
}

function parseManifest(raw: string): Module {
  const json = JSON.parse(raw) as Partial<Module>;
  if (!json.id || !json.service || !json.path) {
    throw new Error('module.json is missing id, service or path');
  }
  const path = json.path.endsWith('/') ? json.path : `${json.path}/`;
  const port = json.portEnv ? Number(process.env[json.portEnv]) : NaN;
  return {
    id: json.id,
    num: json.num ?? 99,
    label: json.label ?? json.id,
    icon: json.icon ?? 'module',
    description: json.description ?? '',
    service: json.service,
    path,
    portEnv: json.portEnv,
    stripPrefix: json.stripPrefix,
    health: json.health,
    dirs: json.dirs ?? [],
    optional: json.optional ?? true,
    requires: json.requires ?? [],
    dependsOn: json.dependsOn ?? [],
    containerName: `offline-pi-${json.service}`,
    upstream: json.portEnv && Number.isFinite(port) && port > 0 ? `http://${bindAddress()}:${port}` : null,
  };
}

/** Loads every services/<name>/module.json (core included), sorted by nav order. */
export async function loadModules(dir = MODULES_DIR): Promise<Module[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const modules = await Promise.all(
    files.map(async (f) => parseManifest(await readFile(join(dir, f), 'utf8'))),
  );
  return modules.sort((a, b) => a.num - b.num);
}
