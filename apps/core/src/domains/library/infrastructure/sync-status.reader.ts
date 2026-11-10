import { Injectable } from '@nestjs/common';
import type { LibrarySync } from '../domain/library.dto';
import { ContentDir } from './content-dir';

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
  constructor(private readonly content: ContentDir) {}

  async read(): Promise<LibrarySync> {
    const text = await this.content.readText('.cache', 'sync.json');
    if (!text) return UNKNOWN;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
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
      downloadedBytes: file ? await this.partialBytes(file, size) : null,
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
  private async partialBytes(file: string, size: number | null): Promise<number | null> {
    const usage = await this.content.partialUsage(file);
    if (!usage) return null;
    if (size && usage.used >= size) return null; // still downloading, so not a measure
    return usage.used;
  }
}
