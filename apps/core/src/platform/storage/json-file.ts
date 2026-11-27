import { Logger } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** CORE_DATA_DIR inside core's container (/app/data), ./data in development. */
export const CORE_DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');

/**
 * A small JSON document core keeps in CORE_DATA_DIR (board.json,
 * supplies.json). Each save writes a temp file and renames it into place,
 * one save at a time, so a power cut leaves the old or the new file, never
 * half of one.
 */
export class JsonFile<T> {
  private readonly logger: Logger;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    readonly path: string,
    private readonly fallback: () => T,
  ) {
    this.logger = new Logger(`JsonFile ${path.split('/').pop()}`);
  }

  static inDataDir<T>(name: string, fallback: () => T): JsonFile<T> {
    return new JsonFile(join(CORE_DATA_DIR, name), fallback);
  }

  /** The stored document, or the fallback when there is none (or it is unreadable). */
  async load(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`ignoring unreadable ${this.path}: ${(err as Error).message}`);
      }
      return this.fallback();
    }
  }

  save(value: T): Promise<void> {
    const text = JSON.stringify(value);
    const write = async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, text, 'utf8');
      await rename(tmp, this.path);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}
