import { lstat, opendir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { HOST_PROC, readText } from '../../../platform/host/host';

export interface MountInfo {
  device: string;
  mountPoint: string;
  fsType: string;
}

/** The host's mount table (pid 1's: core runs with pid: host). */
export async function readMounts(): Promise<MountInfo[]> {
  const text =
    (await readText(join(HOST_PROC, '1/mounts'))) ?? (await readText(join(HOST_PROC, 'mounts'))) ?? '';
  const unescape = (s: string) => s.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
  return text
    .split('\n')
    .map((line) => line.split(' '))
    .filter((f) => f.length >= 3)
    .map(([device, mountPoint, fsType]) => ({
      device: unescape(device!),
      mountPoint: unescape(mountPoint!),
      fsType: fsType!,
    }));
}

/** The mount a host path is on: the longest mount point that contains it. */
export function mountOf(hostPath: string, mounts: MountInfo[]): MountInfo | null {
  let best: MountInfo | null = null;
  for (const m of mounts) {
    const inside =
      m.mountPoint === '/' || hostPath === m.mountPoint || hostPath.startsWith(m.mountPoint + '/');
    if (inside && (!best || m.mountPoint.length >= best.mountPoint.length)) best = m;
  }
  return best;
}

export async function space(path: string): Promise<{ total: number; free: number } | null> {
  try {
    const s = await statfs(path);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

export async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export interface DirUsage {
  bytes: number;
  files: number;
  complete: boolean;
}

/**
 * Disk usage of a directory tree, like `du -s`: allocated blocks, so sparse
 * downloads count as what they really take. Symlinks are not followed.
 * Stops after `maxMs` or `maxEntries` (complete: false).
 */
export async function dirUsage(root: string, maxMs = 20_000, maxEntries = 500_000): Promise<DirUsage | null> {
  const started = Date.now();
  let bytes = 0;
  let files = 0;
  let entries = 0;
  try {
    const st = await lstat(root);
    if (!st.isDirectory()) return null;
  } catch {
    return null;
  }
  const stack = [root];
  while (stack.length) {
    if (Date.now() - started > maxMs || entries > maxEntries) return { bytes, files, complete: false };
    const dir = stack.pop()!;
    let handle;
    try {
      handle = await opendir(dir);
    } catch {
      continue; // unreadable folder: skip it
    }
    for await (const entry of handle) {
      entries++;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      try {
        const st = await lstat(path);
        bytes += st.blocks != null ? st.blocks * 512 : st.size;
        files++;
      } catch {
        // vanished while walking
      }
    }
  }
  return { bytes, files, complete: true };
}

