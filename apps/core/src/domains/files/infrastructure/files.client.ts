import { Injectable } from '@nestjs/common';
import { UpstreamClient, UpstreamService } from '../../../platform/upstream/upstream.service';
import type { FileEntry, FilesStatus, FolderListing } from '../domain/files.dto';

type Raw = Record<string, unknown>;

/** The files container's HTTP API (apps/files, FastAPI), on loopback. */
@Injectable()
export class FilesClient {
  constructor(private readonly upstream: UpstreamService) {}

  get c(): UpstreamClient {
    return this.upstream.client('files');
  }

  /** "Photos/a b.jpg" -> "/svc/files/raw/Photos/a%20b.jpg" */
  rawUrl(path: string): string {
    return this.c.module.svcPath + 'raw/' + path.split('/').map(encodeURIComponent).join('/');
  }

  private entry(raw: Raw): FileEntry {
    const path = String(raw.path);
    const kind = raw.kind === 'folder' ? 'folder' : 'file';
    return {
      name: String(raw.name),
      path,
      kind,
      size: (raw.size as number | null) ?? null,
      modified: Number(raw.modified) || 0,
      mime: (raw.mime as string | null) ?? null,
      items: (raw.items as number | null) ?? null,
      url: kind === 'file' ? this.rawUrl(path) : null,
    };
  }

  async status(): Promise<FilesStatus> {
    const r = await this.c.get<Raw>('/api/status');
    return {
      usedBytes: Number(r.used_bytes) || 0,
      files: Number(r.files) || 0,
      folders: Number(r.folders) || 0,
      freeBytes: (r.free_bytes as number | null) ?? null,
      maxUploadBytes: Number(r.max_upload_bytes) || 0,
      minFreeBytes: Number(r.min_free_bytes) || 0,
    };
  }

  async list(path: string): Promise<FolderListing> {
    const r = await this.c.get<{ path: string; entries: Raw[] }>('/api/list', { query: { path } });
    return { path: r.path, entries: r.entries.map((e) => this.entry(e)) };
  }

  async createFolder(path: string): Promise<FileEntry> {
    return this.entry(await this.c.post<Raw>('/api/folders', { path }));
  }

  async move(from: string, to: string): Promise<FileEntry> {
    return this.entry(await this.c.post<Raw>('/api/move', { from, to }));
  }

  async remove(path: string): Promise<void> {
    await this.c.delete<void>('/api/entries', { query: { path } });
  }
}
