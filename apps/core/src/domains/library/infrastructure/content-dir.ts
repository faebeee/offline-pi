import { Injectable } from '@nestjs/common';
import { readFile, readdir, stat, statfs } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { HOST_ROOT } from '../../../platform/host/host';
import { APPS_DIR } from '../../../platform/modules/registry';

/** A Kiwix name: the ZIM file name without date suffix and ".zim". */
export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** "wikipedia_en_all_maxi_2026-10.zim" -> "wikipedia_en_all_maxi" (same rule as knowledge.sh). */
export function zimKey(file: string): string {
  return file
    .replace(/^.*\//, '')
    .replace(/\.zim$/, '')
    .replace(/_\d{4}-\d{2}(-\d{2})?[a-z]?$/, '');
}

/**
 * KNOWLEDGE_CONTENT_DIR, read through core's read-only host mount (HOST_ROOT,
 * /hostfs in the container): the selection, the installed ZIMs, the sync
 * status and the free space. Only the knowledge container writes there
 * (container/knowledge.sh).
 */
@Injectable()
export class ContentDir {
  /** The directory as core sees it, or null when it can't be resolved. */
  path(): string | null {
    const dir = process.env.KNOWLEDGE_CONTENT_DIR || './data/knowledge';
    // install.sh writes absolute paths; a relative one is relative to the
    // checkout, which only development (HOST_ROOT=/) can resolve
    if (isAbsolute(dir)) return join(HOST_ROOT, dir);
    return HOST_ROOT === '/' ? resolve(APPS_DIR, '..', dir) : null;
  }

  async readText(...parts: string[]): Promise<string | null> {
    const dir = this.path();
    if (!dir) return null;
    try {
      return await readFile(join(dir, ...parts), 'utf8');
    } catch {
      return null;
    }
  }

  /** The selected keys (selection.txt), in order. */
  async selection(): Promise<string[]> {
    const text = await this.readText('selection.txt');
    if (!text) return [];
    const keys = text
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter((k) => KEY_PATTERN.test(k));
    return [...new Set(keys)];
  }

  /** Installed ZIMs by key: the newest file of each and its size. */
  async installed(): Promise<Map<string, { file: string; size: number }>> {
    const dir = this.path();
    const out = new Map<string, { file: string; size: number }>();
    if (!dir) return out;
    let files: string[];
    try {
      files = (await readdir(join(dir, 'zim'))).filter((f) => f.endsWith('.zim')).sort();
    } catch {
      return out;
    }
    for (const file of files) {
      try {
        // sorted, so a later file of the same key is newer
        out.set(zimKey(file), { file, size: (await stat(join(dir, 'zim', file))).size });
      } catch {
        // vanished meanwhile
      }
    }
    return out;
  }

  /** Bytes free for downloads, or null when unknown. */
  async freeBytes(): Promise<number | null> {
    const dir = this.path();
    if (!dir) return null;
    try {
      const fs = await statfs(dir);
      return fs.bavail * fs.bsize;
    } catch {
      return null;
    }
  }

  /** Blocks a partial download really uses (bytes), or null when unknown. */
  async partialUsage(file: string): Promise<{ used: number } | null> {
    const dir = this.path();
    if (!dir || file.includes('/')) return null;
    try {
      const st = await stat(join(dir, '.partial', file));
      return { used: st.blocks * 512 };
    } catch {
      return null;
    }
  }
}
