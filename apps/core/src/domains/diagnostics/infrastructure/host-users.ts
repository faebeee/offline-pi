import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { HOST_ROOT, HOST_PROC, readText } from '../../../platform/host/host';
import { onHost, projectDir } from '../../settings/infrastructure/env-files';

/** One range of /proc/self/uid_map: container ids [inside, inside+count) are host ids from outside. */
interface IdRange {
  inside: number;
  outside: number;
  count: number;
}

async function readMap(file: string): Promise<IdRange[]> {
  const text = (await readText(join(HOST_PROC, 'self', file))) ?? '';
  return text
    .split('\n')
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((f) => f.length === 3 && f.every(Number.isFinite))
    .map(([inside, outside, count]) => ({
      inside: inside!,
      outside: outside!,
      count: count!,
    }));
}

/**
 * Translates owner ids core sees through /hostfs back to the Pi's ids. Core
 * runs in rootless Podman's user namespace: the host user is root in here,
 * and ids outside the namespace (root on the host, for example) all show as
 * 65534. Those come back as null: "someone else".
 */
export class IdMapper {
  private constructor(
    private readonly uids: IdRange[],
    private readonly gids: IdRange[],
  ) {}

  static async load(): Promise<IdMapper> {
    return new IdMapper(await readMap('uid_map'), await readMap('gid_map'));
  }

  /** No namespace (development, or core not in a container): ids are the host's. */
  private static translate(id: number, ranges: IdRange[]): number | null {
    if (!ranges.length) return id;
    for (const r of ranges) if (id >= r.inside && id < r.inside + r.count) return r.outside + (id - r.inside);
    return null;
  }

  uid(id: number): number | null {
    return IdMapper.translate(id, this.uids);
  }

  gid(id: number): number | null {
    return IdMapper.translate(id, this.gids);
  }
}

export interface HostUser {
  uid: number;
  name: string | null;
  /** primary and supplementary groups */
  gids: number[];
}

/**
 * The Pi user the containers write as. Rootless Podman maps every
 * container's user to the user that runs podman (keep-id for maps and
 * knowledge, root for mesh and core), so a data folder must be writable for
 * that user. Taken from PODMAN_SOCKET (/run/user/<uid>/...), else the owner
 * of the project folder.
 */
export async function hostUser(ids: IdMapper): Promise<HostUser | null> {
  let uid: number | null = null;
  const m = /\/run\/user\/(\d+)\//.exec(process.env.PODMAN_SOCKET ?? '');
  if (m) uid = Number(m[1]);
  if (uid === null) {
    const project = projectDir();
    if (project) {
      try {
        uid = ids.uid((await stat(onHost(project))).uid);
      } catch {
        // unreadable
      }
    }
  }
  if (uid === null) return null;

  const passwd = (await readText(join(HOST_ROOT, 'etc/passwd'))) ?? '';
  const row = passwd
    .split('\n')
    .map((l) => l.split(':'))
    .find((f) => Number(f[2]) === uid);
  const name = row?.[0] ?? null;
  const gids = row ? [Number(row[3])] : [];
  if (name) {
    const group = (await readText(join(HOST_ROOT, 'etc/group'))) ?? '';
    for (const f of group.split('\n').map((l) => l.split(':'))) {
      if ((f[3] ?? '').split(',').includes(name)) gids.push(Number(f[2]));
    }
  }
  return { uid, name, gids };
}
