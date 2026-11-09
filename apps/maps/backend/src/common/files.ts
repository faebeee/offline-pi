import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

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
 * Recursively copies `src` to `dest` by streaming file contents rather than
 * using `fs.cp`/`fs.copyFile`. Those preserve the source file's permission
 * bits via `fchmod` after copying, which fails with `EPERM` on filesystems
 * that don't support per-file permissions (e.g. exFAT, common on external
 * USB/SSD storage on a Raspberry Pi). Streaming avoids that call entirely.
 *
 * Symlinks are dereferenced and their target's actual content copied instead
 * of recreated as a symlink, for the same reason: exFAT doesn't support
 * symlinks either (upstream tarballs like basemaps-assets' fonts/ share
 * glyphs between stacks via symlinks).
 */
async function copyDirContents(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = await fs.realpath(srcPath);
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) await copyDirContents(resolved, destPath);
      else await pipeline(createReadStream(resolved), createWriteStream(destPath));
    } else if (entry.isDirectory()) {
      await copyDirContents(srcPath, destPath);
    } else {
      await pipeline(createReadStream(srcPath), createWriteStream(destPath));
    }
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
    const stat = await fs.stat(src);
    if (stat.isDirectory()) {
      await copyDirContents(src, dest);
    } else {
      await pipeline(createReadStream(src), createWriteStream(dest));
    }
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
