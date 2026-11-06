import fs from "node:fs/promises";
import path from "node:path";

/**
 * Guards against path traversal: the resolved path must stay inside `root`.
 * Returns undefined when it escapes.
 */
export function safeJoin(root: string, ...parts: string[]): string | undefined {
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return undefined;
  return target;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves a file or directory, falling back to copy+remove when the source and
 * destination are on different filesystems/devices (e.g. separate Docker
 * volumes), where `fs.rename` fails with `EXDEV`.
 */
export async function moveDir(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await fs.cp(src, dest, { recursive: true });
    await fs.rm(src, { recursive: true, force: true });
  }
}

/** `fs.stat`, but undefined instead of throwing when the file is not there. */
export async function statFile(file: string): Promise<{ size: number; mtimeMs: number } | undefined> {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() ? { size: stat.size, mtimeMs: stat.mtimeMs } : undefined;
  } catch {
    return undefined;
  }
}

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
}
