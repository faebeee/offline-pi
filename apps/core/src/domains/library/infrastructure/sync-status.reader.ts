import { Injectable } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { HOST_ROOT } from '../../../platform/host/host';
import { APPS_DIR } from '../../../platform/modules/registry';
import type { LibrarySync } from '../domain/library.dto';

const UNKNOWN: LibrarySync = {
  state: 'unknown',
  phase: null,
  file: null,
  size: null,
  downloadedBytes: null,
  index: 0,
  count: 0,
  failed: 0,
  result: null,
  message: null,
  startedAt: null,
  updatedAt: null,
};

/**
 * Reads the knowledge container's sync status (.cache/sync.json in
 * KNOWLEDGE_CONTENT_DIR, written by container/knowledge.sh). kiwix-serve has
 * no place for it, so core reads the file through its read-only host mount
 * (HOST_ROOT, /hostfs in the container) instead of the container's port.
 */
@Injectable()
export class SyncStatusReader {
  /** KNOWLEDGE_CONTENT_DIR as core sees it, or null when it can't be resolved. */
  private contentDir(): string | null {
    const dir = process.env.KNOWLEDGE_CONTENT_DIR || './data/knowledge';
    // install.sh writes absolute paths; a relative one is relative to the
    // checkout, which only development (HOST_ROOT=/) can resolve
    if (isAbsolute(dir)) return join(HOST_ROOT, dir);
    return HOST_ROOT === '/' ? resolve(APPS_DIR, '..', dir) : null;
  }

  async read(): Promise<LibrarySync> {
    const dir = this.contentDir();
    if (!dir) return UNKNOWN;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(await readFile(join(dir, '.cache', 'sync.json'), 'utf8')) as Record<string, unknown>;
    } catch {
      return UNKNOWN;
    }
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const state = raw.state === 'running' ? 'running' : 'idle';
    const phase = state === 'running' ? (str(raw.phase) as LibrarySync['phase']) : null;
    const file = state === 'running' ? str(raw.file) : null;
    const size = file ? num(raw.size) || null : null;
    return {
      state,
      phase,
      file,
      size,
      downloadedBytes: file ? await this.partialBytes(dir, file, size) : null,
      index: num(raw.index),
      count: num(raw.count),
      failed: num(raw.failed),
      result: state === 'idle' ? (str(raw.result) as LibrarySync['result']) : null,
      message: str(raw.message),
      startedAt: num(raw.startedAt) || null,
      updatedAt: num(raw.updatedAt) || null,
    };
  }

  /**
   * Bytes of the download so far: the blocks the partial file really uses
   * (aria2c writes it sparse, without preallocation). On filesystems without
   * sparse files (exFAT) the file takes its full size at once, which says
   * nothing: then null, and the screen shows no progress bar.
   */
  private async partialBytes(dir: string, file: string, size: number | null): Promise<number | null> {
    if (file.includes('/')) return null;
    try {
      const st = await stat(join(dir, '.partial', file));
      const used = st.blocks * 512;
      if (size && used >= size) return null; // still downloading, so not a measure
      return used;
    } catch {
      return null;
    }
  }
}
