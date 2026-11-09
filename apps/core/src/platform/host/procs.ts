import { readdir, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HOST_PROC, readText } from './host';

export interface Proc {
  pid: number;
  ppid: number;
  comm: string;
  /** utime + stime in clock ticks */
  cpuTicks: number;
  cmdline?: string;
}

/** Reads every process of the host (we run with pid: host). */
export async function readProcs(): Promise<Map<number, Proc>> {
  const procs = new Map<number, Proc>();
  let entries: string[] = [];
  try {
    entries = await readdir(HOST_PROC);
  } catch {
    return procs;
  }
  await Promise.all(
    entries
      .filter((e) => /^\d+$/.test(e))
      .map(async (e) => {
        const stat = await readText(join(HOST_PROC, e, 'stat'));
        if (!stat) return;
        // "pid (comm with spaces) S ppid ..." - comm may contain ')'
        const open = stat.indexOf('(');
        const close = stat.lastIndexOf(')');
        const rest = stat.slice(close + 2).split(' ');
        procs.set(Number(e), {
          pid: Number(e),
          comm: stat.slice(open + 1, close),
          ppid: Number(rest[1]),
          cpuTicks: Number(rest[11]) + Number(rest[12]),
        });
      }),
  );
  return procs;
}

export async function readCmdline(pid: number): Promise<string> {
  return ((await readText(join(HOST_PROC, String(pid), 'cmdline'))) ?? '').split('\0').join(' ').trim();
}

/** Resident memory of a process in bytes (VmRSS; page-size independent). */
export async function readRss(pid: number): Promise<number> {
  const status = await readText(join(HOST_PROC, String(pid), 'status'));
  const m = status?.match(/^VmRSS:\s+(\d+)\s+kB/m);
  return m ? Number(m[1]) * 1024 : 0;
}

/**
 * Maps socket inodes to the pid owning them. Only processes of the user the
 * container runs as are readable (rootless podman: the host user), so
 * system daemons owned by root stay unattributed.
 */
export async function socketOwners(pids: Iterable<number>): Promise<Map<number, number>> {
  const owners = new Map<number, number>();
  await Promise.all(
    [...pids].map(async (pid) => {
      const dir = join(HOST_PROC, String(pid), 'fd');
      let fds: string[];
      try {
        fds = await readdir(dir);
      } catch {
        return; // not ours
      }
      await Promise.all(
        fds.map(async (fd) => {
          try {
            const link = await readlink(join(dir, fd));
            const m = /^socket:\[(\d+)\]$/.exec(link);
            if (m) owners.set(Number(m[1]), pid);
          } catch {
            // fd closed meanwhile
          }
        }),
      );
    }),
  );
  return owners;
}

/** All descendants of `root` (inclusive). */
export function descendants(procs: Map<number, Proc>, root: number): number[] {
  const children = new Map<number, number[]>();
  for (const p of procs.values()) {
    const list = children.get(p.ppid) ?? [];
    list.push(p.pid);
    children.set(p.ppid, list);
  }
  const out: number[] = [];
  const stack = [root];
  while (stack.length) {
    const pid = stack.pop()!;
    if (!procs.has(pid)) continue;
    out.push(pid);
    stack.push(...(children.get(pid) ?? []));
  }
  return out;
}
