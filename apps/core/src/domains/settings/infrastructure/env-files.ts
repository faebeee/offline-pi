import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { HOST_ROOT } from '../../../platform/host/host';
import { APPS_DIR } from '../../../platform/modules/registry';

/** One variable as documented in .env.example. */
export interface DocumentedVar {
  key: string;
  defaultValue: string;
  description: string;
}

export interface DocumentedSection {
  id: string;
  vars: DocumentedVar[];
}

/**
 * The project folder on the Pi. start.sh passes it to core as OUTPOST_DIR
 * (lib/common.sh); in development core runs from the checkout itself.
 */
export function projectDir(): string | null {
  if (process.env.OUTPOST_DIR) return process.env.OUTPOST_DIR;
  return HOST_ROOT === '/' ? resolve(APPS_DIR, '..') : null;
}

/** A path on the Pi as core sees it (through the read-only /hostfs mount). */
export function onHost(hostPath: string): string {
  return join(HOST_ROOT, hostPath);
}

/** A *_DIR value as an absolute path on the Pi (relative = to the project folder). */
export function resolveHostPath(value: string): string | null {
  if (isAbsolute(value)) return resolve(value);
  const project = projectDir();
  return project ? resolve(project, value) : null;
}

async function read(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** KEY=VALUE lines of an env file; quotes around a value are removed. */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(raw);
    if (!m) continue;
    let value = m[2]!.trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out.set(m[1]!, value);
  }
  return out;
}

const SECTION = /^#\s*-{3,}\s*([A-Za-z0-9_-]+)\s*-*\s*$/;

/**
 * .env.example's blocks ("# ------ maps --") and, for every variable, the
 * comment right above it. Variables written one after another share the
 * comment above the first; a blank line ends a comment.
 */
export function parseExample(text: string): DocumentedSection[] {
  const sections: DocumentedSection[] = [];
  let current: DocumentedSection | null = null;
  let comment: string[] = [];
  let shared = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const header = SECTION.exec(line);
    if (header) {
      current = { id: header[1]!.toLowerCase(), vars: [] };
      sections.push(current);
      comment = [];
      shared = '';
      continue;
    }
    if (!line) {
      comment = [];
      shared = '';
      continue;
    }
    if (line.startsWith('#')) {
      comment.push(line.replace(/^#\s?/, ''));
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    if (comment.length) {
      shared = comment.join(' ').replace(/\s+/g, ' ').trim();
      comment = [];
    }
    if (!current) {
      current = { id: 'general', vars: [] };
      sections.push(current);
    }
    current.vars.push({ key: m[1]!, defaultValue: m[2]!.trim(), description: shared });
  }
  return sections;
}

/** .env.example: the checkout's (newest), else the copy in core's image. */
export async function readExample(): Promise<string | null> {
  const project = projectDir();
  return (
    (project ? await read(onHost(join(project, '.env.example'))) : null) ??
    (await read(resolve(APPS_DIR, '..', '.env.example')))
  );
}

/** .env from the project folder, with its path on the Pi; null when unreadable. */
export async function readEnvFile(): Promise<{ path: string; values: Map<string, string> } | null> {
  const project = projectDir();
  if (!project) return null;
  const path = join(project, '.env');
  const text = await read(onHost(path));
  return text === null ? null : { path, values: parseEnv(text) };
}
