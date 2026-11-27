import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rename, rm, stat, statfs, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { FileEntry } from '../domain/files.dto';

const MB = 1024 ** 2;
const MAX_NAME_BYTES = 255;
const MAX_DEPTH = 16;
const UPLOAD_PREFIX = '.upload-';
const STALE_UPLOAD_MS = 24 * 3600_000;
const USAGE_TTL_MS = 30_000;

/** The public URL of a file's bytes, served by core (FilesController). */
export const RAW_PREFIX = '/api/files/raw/';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.heic': 'image/heic', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/csv', '.log': 'text/plain',
  '.html': 'text/html', '.htm': 'text/html', '.xml': 'application/xml', '.json': 'application/json', '.js': 'text/javascript',
  '.zip': 'application/zip', '.gz': 'application/gzip', '.tar': 'application/x-tar', '.7z': 'application/x-7z-compressed',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.epub': 'application/epub+zip', '.gpx': 'application/gpx+xml', '.kml': 'application/vnd.google-earth.kml+xml',
};

/** Shown in the browser; anything else (HTML, SVG, scripts, unknown) is only downloaded. */
const SAFE_INLINE = ['image/', 'audio/', 'video/', 'text/plain', 'text/csv', 'application/pdf'];

export function mimeOf(name: string): string | null {
  return MIME[extname(name).toLowerCase()] ?? null;
}

export function inlineSafe(mime: string | null): boolean {
  return !!mime && mime !== 'image/svg+xml' && SAFE_INLINE.some((p) => mime.startsWith(p));
}

/** "Photos/a b.jpg" -> "/api/files/raw/Photos/a%20b.jpg" */
export function rawUrl(path: string): string {
  return RAW_PREFIX + path.split('/').map(encodeURIComponent).join('/');
}

export function checkName(name: string): string {
  if (!name || name === '.' || name === '..') throw new BadRequestException("A name can't be empty, '.' or '..'.");
  if (name.startsWith('.')) throw new BadRequestException("Names can't start with a dot.");
  if (/[/\\\0]/.test(name)) throw new BadRequestException("A name can't contain / or \\.");
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(name)) throw new BadRequestException("A name can't contain control characters.");
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) throw new BadRequestException(`A name can be at most ${MAX_NAME_BYTES} bytes long.`);
  return name;
}

/** "a//b/./c.txt" -> ["a", "b", "c.txt"]; "" -> [] (the top folder). */
export function cleanParts(path: string): string[] {
  if (/[\\\0]/.test(path)) throw new BadRequestException('Paths may not contain backslashes or NUL.');
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  if (parts.length > MAX_DEPTH) throw new BadRequestException(`Folders can be at most ${MAX_DEPTH} levels deep.`);
  parts.forEach(checkName);
  return parts;
}

const exists = (p: string) => lstat(p).then(() => true, () => false);

/**
 * The shared folder (FILES_DATA_DIR on the host, FILES_DIR in core's
 * container). Every path the API takes is relative to it, "/"-separated,
 * and checked here: no "..", no absolute paths, no names starting with a
 * dot (hidden; ".upload-*" are uploads in progress), no control characters;
 * a symlink placed on the disk by hand may not lead outside.
 */
@Injectable()
export class SharedFolder implements OnModuleInit {
  private readonly logger = new Logger('SharedFolder');
  readonly root = process.env.FILES_DIR ?? join(process.cwd(), 'data', 'files');
  readonly maxUploadBytes = (Number(process.env.FILES_MAX_UPLOAD_MB) || 4096) * MB;
  readonly minFreeBytes = (Number(process.env.FILES_MIN_FREE_MB) || 1024) * MB;
  private rootReal = this.root;
  private usageCache: { at: number; value: { bytes: number; files: number; folders: number } } | null = null;

  async onModuleInit(): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true });
      this.rootReal = await realpath(this.root);
      const removed = await this.sweepUploads();
      if (removed) this.logger.log(`Removed ${removed} cut-off uploads`);
    } catch (err) {
      this.logger.warn(`shared folder ${this.root} not usable: ${(err as Error).message}`);
    }
  }

  /** [absolute path, normalized relative path]; never outside the root. */
  async resolve(path: string): Promise<[string, string]> {
    const parts = cleanParts(path);
    const full = join(this.root, ...parts);
    // the deepest part that exists must stay inside (symlinks placed by hand)
    let probe = full;
    while (!(await exists(probe)) && probe !== this.root) probe = dirname(probe);
    const real = await realpath(probe);
    if (real !== this.rootReal && !real.startsWith(this.rootReal + sep)) {
      throw new BadRequestException('That path leads outside the shared folder.');
    }
    return [full, parts.join('/')];
  }

  async entry(full: string, rel: string): Promise<FileEntry> {
    const st = await stat(full);
    if (st.isDirectory()) {
      const items = await readdir(full).then((n) => n.filter((x) => !x.startsWith('.')).length, () => null);
      return { name: basename(full), path: rel, kind: 'folder', size: null, modified: Math.floor(st.mtimeMs / 1000), mime: null, items, url: null };
    }
    const name = basename(full);
    return { name, path: rel, kind: 'file', size: st.size, modified: Math.floor(st.mtimeMs / 1000), mime: mimeOf(name), items: null, url: rawUrl(rel) };
  }

  async list(path: string): Promise<{ path: string; entries: FileEntry[] }> {
    const [full, rel] = await this.resolve(path);
    const st = await stat(full).catch(() => null);
    if (!st) throw new NotFoundException(`'${rel || '/'}' does not exist.`);
    if (!st.isDirectory()) throw new BadRequestException(`'${rel}' is a file, not a folder.`);
    const entries: FileEntry[] = [];
    for (const name of await readdir(full)) {
      if (name.startsWith('.')) continue;
      try {
        entries.push(await this.entry(join(full, name), rel ? `${rel}/${name}` : name));
      } catch {
        // vanished meanwhile, or a broken link
      }
    }
    entries.sort((a, b) => Number(a.kind !== 'folder') - Number(b.kind !== 'folder') || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return { path: rel, entries };
  }

  /** A file to download: [root-relative path for sendFile, its name]. */
  async file(path: string): Promise<{ rel: string; name: string }> {
    const [full, rel] = await this.resolve(path);
    const st = await stat(full).catch(() => null);
    if (!rel || !st?.isFile()) throw new NotFoundException(`'${rel || '/'}' is not a file.`);
    return { rel, name: basename(full) };
  }

  async usage(): Promise<{ bytes: number; files: number; folders: number }> {
    if (this.usageCache && Date.now() - this.usageCache.at < USAGE_TTL_MS) return this.usageCache.value;
    const value = { bytes: 0, files: 0, folders: 0 };
    const walk = async (dir: string): Promise<void> => {
      for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (d.name.startsWith('.')) continue;
        const p = join(dir, d.name);
        if (d.isDirectory()) {
          value.folders += 1;
          await walk(p);
        } else if (d.isFile()) {
          value.files += 1;
          value.bytes += await lstat(p).then((s) => s.size, () => 0);
        }
      }
    };
    await walk(this.root);
    this.usageCache = { at: Date.now(), value };
    return value;
  }

  async freeBytes(): Promise<number | null> {
    try {
      const s = await statfs(this.root);
      return s.bavail * s.bsize;
    } catch {
      return null;
    }
  }

  async mkdir(path: string): Promise<FileEntry> {
    const [full, rel] = await this.resolve(path);
    if (!rel) throw new BadRequestException('Give the new folder a name.');
    if (!(await stat(dirname(full)).then((s) => s.isDirectory(), () => false))) {
      throw new NotFoundException('The folder it should go into does not exist.');
    }
    if (await exists(full)) throw new ConflictException(`'${basename(full)}' exists already.`);
    await mkdir(full);
    this.usageCache = null;
    return this.entry(full, rel);
  }

  async move(from: string, to: string): Promise<FileEntry> {
    const [src, srel] = await this.resolve(from);
    const [dst, drel] = await this.resolve(to);
    if (!srel || !drel) throw new BadRequestException("The top folder can't be moved.");
    const s = await stat(src).catch(() => null);
    if (!s) throw new NotFoundException(`'${srel}' does not exist.`);
    if (srel === drel) return this.entry(src, srel);
    if (!(await stat(dirname(dst)).then((x) => x.isDirectory(), () => false))) throw new NotFoundException('The target folder does not exist.');
    if (s.isDirectory() && (drel + '/').startsWith(srel + '/')) throw new BadRequestException("A folder can't be moved into itself.");
    const d = await stat(dst).catch(() => null);
    // the same file under another case (case-insensitive drives) is a rename, not a clash
    if (d && !(d.ino === s.ino && d.dev === s.dev)) throw new ConflictException(`'${basename(dst)}' exists already.`);
    await rename(src, dst);
    return this.entry(dst, drel);
  }

  async remove(path: string): Promise<void> {
    const [full, rel] = await this.resolve(path);
    if (!rel) throw new BadRequestException("The top folder can't be deleted.");
    if (!(await exists(full))) throw new NotFoundException(`'${rel}' does not exist.`);
    await rm(full, { recursive: true, force: true });
    this.usageCache = null;
  }

  /**
   * Stream an upload into a temp file next to the target, then rename it
   * into place: a cut-off upload leaves nothing visible.
   */
  async upload(path: string, body: Readable, opts: { overwrite: boolean; length: number | null }): Promise<FileEntry> {
    const [full, rel] = await this.resolve(path);
    if (!rel) throw new BadRequestException('Give the file a name.');
    if (!(await stat(dirname(full)).then((s) => s.isDirectory(), () => false))) {
      throw new NotFoundException('The folder it should go into does not exist.');
    }
    const existing = await stat(full).catch(() => null);
    if (existing?.isDirectory()) throw new ConflictException(`'${basename(full)}' is a folder.`);
    if (existing && !opts.overwrite) throw new ConflictException(`'${basename(full)}' exists already.`);
    if (opts.length !== null) await this.checkRoom(opts.length);

    const tmp = join(dirname(full), `${UPLOAD_PREFIX}${randomUUID()}`);
    let written = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp);
        const fail = (err: Error) => {
          body.unpipe(out);
          out.destroy();
          reject(err);
        };
        body.on('data', (chunk: Buffer) => {
          written += chunk.length;
          if (written > this.maxUploadBytes) fail(this.tooLarge());
        });
        body.on('aborted', () => fail(new BadRequestException('The upload was cut off. Try again.')));
        body.on('error', fail);
        out.on('error', fail);
        out.on('finish', resolve);
        body.pipe(out);
      });
      if (opts.length !== null && written !== opts.length) throw new BadRequestException('The upload was cut off. Try again.');
      if (opts.length === null) await this.checkRoom(0);
      if (!opts.overwrite && (await exists(full))) throw new ConflictException(`'${basename(full)}' exists already.`);
      await rename(tmp, full);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    }
    this.usageCache = null;
    return this.entry(full, rel);
  }

  private tooLarge(): HttpException {
    return new PayloadTooLargeException(`The file is larger than the limit of ${Math.round(this.maxUploadBytes / MB)} MB.`);
  }

  private async checkRoom(length: number): Promise<void> {
    if (length > this.maxUploadBytes) throw this.tooLarge();
    const free = await this.freeBytes();
    if (free !== null && free - length < this.minFreeBytes) {
      throw new HttpException('Not enough free space on the disk for this file.', 507);
    }
  }

  /** Temp files of uploads cut off more than a day ago. */
  private async sweepUploads(): Promise<number> {
    let removed = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = join(dir, d.name);
        if (d.isDirectory() && !d.name.startsWith('.')) await walk(p);
        else if (d.isFile() && d.name.startsWith(UPLOAD_PREFIX)) {
          const st = await stat(p).catch(() => null);
          if (st && Date.now() - st.mtimeMs > STALE_UPLOAD_MS) {
            await unlink(p).catch(() => undefined);
            removed += 1;
          }
        }
      }
    };
    await walk(this.root);
    return removed;
  }
}
