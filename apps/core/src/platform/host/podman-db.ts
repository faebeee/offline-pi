import { access, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// built into Node 22 (flag-free, still marked experimental)
import { DatabaseSync } from 'node:sqlite';
import { HOST_ROOT, readText } from './host';

/** What podman's own state database says about one container. */
export interface PodmanContainer {
  id: string;
  name: string;
  image: string | null;
  project: string | null; // compose project (= outpost app directory)
  service: string | null;
  state: string;
  pid: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  health: string | null; // healthy | unhealthy | starting | null (no check)
  restartPolicy: string | null;
  hostNetwork: boolean;
  ports: { hostIp: string; hostPort: number; containerPort: number; protocol: string }[];
}

// libpod's define.ContainerStatus enum
const STATES = ['unknown', 'configured', 'created', 'running', 'stopped', 'paused', 'exited', 'removing', 'stopping'];

/**
 * Finds podman's sqlite state databases (Podman >= 4.8 default backend).
 * PODMAN_GRAPH_ROOT (host path, written by install.sh from `podman info`)
 * wins; otherwise every rootless user's default store plus the rootful one
 * is tried. Paths are host paths, read through the read-only /hostfs mount.
 */
export async function findPodmanDbs(): Promise<string[]> {
  const configured = process.env.PODMAN_GRAPH_ROOT;
  if (configured) return [join(HOST_ROOT, configured, 'db.sql')];
  const candidates = [join(HOST_ROOT, 'var/lib/containers/storage/db.sql')];
  try {
    for (const user of await readdir(join(HOST_ROOT, 'home'))) {
      candidates.push(join(HOST_ROOT, 'home', user, '.local/share/containers/storage/db.sql'));
    }
  } catch {
    // no /home
  }
  const found: string[] = [];
  for (const c of candidates) {
    try {
      await access(c);
      found.push(c);
    } catch {
      // not there / not readable
    }
  }
  return found;
}

/**
 * Reads all containers from a podman db.sql. Read-only: podman's DB uses a
 * rollback journal, so a read-only handle on the read-only mount is safe; a
 * read that collides with a podman write throws and is retried next cycle.
 */
export async function readPodmanDb(path: string): Promise<PodmanContainer[]> {
  const db = new DatabaseSync(path, { readOnly: true });
  let rows: { ID: string; Config: unknown; State: unknown }[];
  try {
    rows = db
      .prepare(
        'SELECT c.ID AS ID, c.JSON AS Config, s.JSON AS State FROM ContainerConfig c LEFT JOIN ContainerState s ON s.ID = c.ID',
      )
      .all() as typeof rows;
  } finally {
    db.close();
  }

  const out: PodmanContainer[] = [];
  for (const row of rows) {
    const cfg = parseJson(row.Config);
    const st = parseJson(row.State) ?? {};
    if (!cfg || cfg.isInfra) continue;
    const labels: Record<string, string> = cfg.labels ?? {};
    const namespaces: { type: string; path?: string }[] = cfg.spec?.linux?.namespaces ?? [];
    const hasOwnNet = namespaces.some((n) => n.type === 'network');

    let health: string | null = null;
    if (cfg.healthcheck && st.runDir) {
      const log = parseJson(await readText(join(HOST_ROOT, dirname(st.runDir), 'healthcheck.log')));
      health = log?.Status ?? 'starting';
    }

    out.push({
      id: row.ID,
      name: cfg.name,
      image: cfg.rootfsImageName ?? cfg.RawImageName ?? null,
      project: labels['com.docker.compose.project'] ?? labels['io.podman.compose.project'] ?? null,
      service: labels['com.docker.compose.service'] ?? null,
      state: STATES[st.state] ?? 'unknown',
      pid: st.pid || null,
      startedAt: time(st.startedTime),
      finishedAt: time(st.finishedTime),
      exitCode: typeof st.exitCode === 'number' ? st.exitCode : null,
      health,
      restartPolicy: cfg.restart_policy || null,
      hostNetwork: !hasOwnNet && !cfg.createNetNS,
      ports: (cfg.newPortMappings ?? []).map((p: Record<string, unknown>) => ({
        hostIp: (p.host_ip as string) || '0.0.0.0',
        hostPort: Number(p.host_port),
        containerPort: Number(p.container_port),
        protocol: (p.protocol as string) || 'tcp',
      })),
    });
  }
  return out;
}

const decoder = new TextDecoder();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(v: unknown): any {
  if (v == null) return null;
  try {
    return JSON.parse(typeof v === 'string' ? v : decoder.decode(v as Uint8Array));
  } catch {
    return null;
  }
}

function time(s: unknown): number | null {
  if (typeof s !== 'string' || s.startsWith('0001-')) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
