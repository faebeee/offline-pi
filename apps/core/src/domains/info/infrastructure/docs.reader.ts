import { Injectable, Logger } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InfoEntry } from '../domain/info.dto';

/**
 * The repo's docs/ folder. Resolved from this file
 * (apps/core/dist/domains/info/infrastructure), so it is the checkout in
 * development and /app/docs in the image (see the Dockerfile).
 */
export const DOCS_DIR = process.env.INFO_DOCS_DIR ?? join(__dirname, '..', '..', '..', '..', '..', '..', 'docs');

/**
 * The root package.json, whose `version` is the app's version: next to
 * docs/ in the checkout and in the image (/app/package.json).
 */
export const PACKAGE_JSON = process.env.INFO_PACKAGE_JSON ?? join(DOCS_DIR, '..', 'package.json');

/** The changelog, a page of docs/ like any other. */
export const CHANGELOG_FILE = '07-changelog.md';

const README = 'README.md';

/** "02-installation" -> "installation", "01-install.md" -> "install" */
const plain = (name: string) => name.replace(/\.md$/i, '').replace(/^\d+[-_]/, '');

/** "# Install `foo` [bar](x)" -> "Install foo bar" */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(markdown: string, fallback: string): string {
  const m = /^#\s+(.+?)\s*#*\s*$/m.exec(markdown);
  return m ? plainText(m[1]) : fallback;
}

export interface DocFile extends InfoEntry {
  markdown: string;
}

/**
 * Reads docs/ on every call: it is a few dozen small files, and edits show
 * up without a restart in development.
 */
@Injectable()
export class DocsReader {
  private readonly log = new Logger(DocsReader.name);

  readonly root = DOCS_DIR;

  /** The app's version from the root package.json, null if unreadable. */
  async version(): Promise<string | null> {
    try {
      const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8')) as { version?: unknown };
      return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
      this.log.warn(`no version in ${PACKAGE_JSON}`);
      return null;
    }
  }

  /** Every Markdown file in reading order. Empty when docs/ is missing. */
  async files(): Promise<DocFile[]> {
    try {
      return await this.walk('', 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.log.warn(`no documentation at ${this.root}`);
        return [];
      }
      throw err;
    }
  }

  /**
   * One folder: its README.md (at the folder's depth), then its files and
   * sub-folders by name, one level deeper.
   */
  private async walk(rel: string, depth: number): Promise<DocFile[]> {
    const dir = join(this.root, rel);
    const entries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => !e.name.startsWith('.'))
      .filter((e) => e.isDirectory() || /\.md$/i.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));

    const out: DocFile[] = [];
    const readme = entries.find((e) => e.isFile() && e.name === README);
    if (readme) out.push(await this.read(rel, README, depth));
    for (const e of entries) {
      if (e === readme) continue;
      if (e.isDirectory()) {
        out.push(...(await this.walk(rel ? `${rel}/${e.name}` : e.name, depth + 1)));
      } else {
        out.push(await this.read(rel, e.name, depth + 1));
      }
    }
    return out;
  }

  private async read(rel: string, name: string, depth: number): Promise<DocFile> {
    const file = rel ? `${rel}/${name}` : name;
    const markdown = await readFile(join(this.root, file), 'utf8');
    const parts = rel ? rel.split('/').map(plain) : [];
    if (name !== README) parts.push(plain(name));
    const fallback = plain(name === README ? (rel.split('/').pop() ?? 'Documentation') : name).replace(/-/g, ' ');
    return { slug: parts.join('/'), title: titleOf(markdown, fallback || 'Documentation'), depth, file, markdown };
  }
}
