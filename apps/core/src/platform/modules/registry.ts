import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The monorepo's apps/ directory: every apps/<name>/module.json is a module.
 * Resolved from this file (apps/core/dist/platform/modules), so it is the checkout in
 * development and /app/apps in the image, which holds every manifest (see
 * the Dockerfile).
 */
export const APPS_DIR = process.env.APPS_DIR ?? join(__dirname, '..', '..', '..', '..');

/** One entry of a module.json manifest, as documented in the root AGENTS.md. */
export interface Module {
  id: string;
  num: number;
  label: string;
  icon: string;
  description: string;
  /** compose service name; the container is outpost-<service> */
  service: string;
  /** the module's web route, e.g. /maps/ (always has a trailing slash) */
  path: string;
  /**
   * where core passes requests straight through to the module, e.g.
   * /svc/maps/: map tiles, fonts, pmtiles ranges, kiwix articles. Everything
   * else goes through core's own API (/api/<domain>/...).
   */
  svcPath: string;
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
  /** podman container name, outpost-<service> */
  containerName: string;
  /** http://MODULES_BIND_ADDRESS:<port>, only when portEnv resolves to a port */
  upstream: string | null;
}

/** Passthrough root: /svc/<module path>, see Module.svcPath. */
export const SVC_PREFIX = '/svc';

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
    svcPath: `${SVC_PREFIX}${path}`,
    portEnv: json.portEnv,
    stripPrefix: json.stripPrefix,
    health: json.health,
    dirs: json.dirs ?? [],
    optional: json.optional ?? true,
    requires: json.requires ?? [],
    dependsOn: json.dependsOn ?? [],
    containerName: `outpost-${json.service}`,
    upstream: json.portEnv && Number.isFinite(port) && port > 0 ? `http://${bindAddress()}:${port}` : null,
  };
}

async function readManifest(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Loads every apps/<name>/module.json (core included), sorted by nav order. */
export async function loadModules(dir = APPS_DIR): Promise<Module[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const raw = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => readManifest(join(dir, e.name, 'module.json'))),
  );
  return raw
    .filter((r): r is string => r !== null)
    .map(parseManifest)
    .sort((a, b) => a.num - b.num);
}
