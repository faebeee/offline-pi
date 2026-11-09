import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Paths to the host's kernel interfaces. In the container the host root is
 * bind-mounted read-only at /hostfs (podman masks /sys/firmware in the
 * container's own /sys, which is where the device tree lives). /proc is the
 * container's, but it reflects the host because the service runs with
 * pid: host and network_mode: host.
 */
export const HOST_ROOT = process.env.HOST_ROOT ?? '/';
export const HOST_PROC = process.env.HOST_PROC ?? '/proc';
export const HOST_SYS = process.env.HOST_SYS ?? join(HOST_ROOT, 'sys');

export async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

export async function readNumber(path: string): Promise<number | null> {
  const text = await readText(path);
  if (text === null) return null;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

/** Device-tree string property (NUL-terminated). */
export async function readDtString(path: string): Promise<string | null> {
  const text = await readText(path);
  return text === null ? null : text.replace(/\0/g, '').trim();
}

/** Device-tree u32 property (big endian). */
export async function readDtU32(path: string): Promise<number | null> {
  try {
    const buf = await readFile(path);
    return buf.length >= 4 ? buf.readUInt32BE(0) : null;
  } catch {
    return null;
  }
}

export async function list(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}
