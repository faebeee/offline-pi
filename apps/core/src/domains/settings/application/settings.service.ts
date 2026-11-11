import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { APPS_DIR, loadModules, type Module } from '../../../platform/modules/registry';
import {
  SettingPath,
  SettingPathSize,
  SettingSection,
  SettingsOverview,
  SettingsSizes,
  SettingVar,
} from '../domain/settings.dto';
import { dirUsage, isDir, mountOf, readMounts, space } from '../infrastructure/disk';
import { onHost, parseExample, projectDir, readEnvFile, readExample, resolveHostPath } from '../infrastructure/env-files';

/** Names whose values are never sent to the browser. */
const SECRET = /(PIN|PASS(WORD)?|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL)$/;

/** How long a measured folder size is reused. */
const SIZE_TTL_MS = 5 * 60_000;

const firstSentence = (s: string) => /^.*?[.:](\s|$)/.exec(s)?.[0].trim().replace(/[.:]$/, '') ?? s;

/**
 * Read-only view of outpost's configuration: every .env variable with its
 * documentation from .env.example, and every *_DIR with its drive and size.
 * Only install.sh writes .env (AGENTS.md), so nothing here changes it.
 */
@Injectable()
export class SettingsService {
  private cache = new Map<string, SettingPathSize>();
  private measuring: Promise<SettingsSizes> | null = null;
  private modules: Module[] | null = null;

  async overview(): Promise<SettingsOverview> {
    const [exampleText, envFile, modules, mounts, version] = await Promise.all([
      readExample(),
      readEnvFile(),
      this.loadModules(),
      readMounts(),
      this.version(),
    ]);
    const documented = exampleText ? parseExample(exampleText) : [];
    const values = envFile?.values ?? null;
    const valueOf = (key: string): string | undefined => (values ? values.get(key) : process.env[key]);

    const installedList = (valueOf('MODULES') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const byId = new Map(modules.map((m) => [m.id, m]));
    const installed = (id: string) => {
      const m = byId.get(id);
      return !m || !m.optional || installedList.includes(id);
    };

    const seen = new Set<string>();
    const sections: SettingSection[] = documented.map((sec) => {
      const module = byId.get(sec.id) ?? null;
      return {
        id: sec.id,
        title: module?.label ?? sec.id.charAt(0).toUpperCase() + sec.id.slice(1),
        module: module?.id ?? null,
        installed: installed(sec.id),
        vars: sec.vars.map((v) => {
          seen.add(v.key);
          return this.toVar(v.key, valueOf(v.key), v.defaultValue, v.description);
        }),
      };
    });

    // variables in .env that .env.example doesn't know (old or hand-added)
    if (values) {
      const extra = [...values.keys()].filter((k) => !seen.has(k)).sort();
      if (extra.length) {
        sections.push({
          id: 'other',
          title: 'Other',
          module: null,
          installed: true,
          vars: extra.map((k) => this.toVar(k, values.get(k), null, 'In .env, but not documented in .env.example.')),
        });
      }
    }

    const paths: SettingPath[] = [];
    for (const sec of sections) {
      for (const v of sec.vars) {
        if (!v.key.endsWith('_DIR')) continue;
        const value = valueOf(v.key) || v.defaultValue || '';
        if (!value) continue;
        const hostPath = resolveHostPath(value);
        const exists = hostPath ? await isDir(onHost(hostPath)) : false;
        const mount = hostPath ? mountOf(hostPath, mounts) : null;
        const fs = hostPath && exists ? await space(onHost(hostPath)) : null;
        paths.push({
          key: v.key,
          module: sec.module,
          installed: sec.installed,
          description: firstSentence(v.description),
          value,
          hostPath,
          exists,
          device: mount?.device ?? null,
          fsType: mount?.fsType ?? null,
          mountPoint: mount?.mountPoint ?? null,
          totalBytes: fs?.total ?? null,
          freeBytes: fs?.free ?? null,
        });
      }
    }

    return {
      project: projectDir(),
      source: envFile ? 'env-file' : 'environment',
      envFile: envFile?.path ?? null,
      version,
      sections,
      paths,
    };
  }

  /**
   * Disk usage of every *_DIR. Walking a big library takes a while, so
   * results are kept for a few minutes and parallel requests share one walk.
   */
  async sizes(): Promise<SettingsSizes> {
    const fresh = [...this.cache.values()];
    const now = Date.now();
    if (fresh.length && fresh.every((s) => now - Date.parse(s.measuredAt) < SIZE_TTL_MS)) {
      const keys = new Set((await this.overview()).paths.map((p) => p.key));
      if ([...keys].every((k) => this.cache.has(k))) return { sizes: fresh.filter((s) => keys.has(s.key)) };
    }
    this.measuring ??= this.measure().finally(() => {
      this.measuring = null;
    });
    return this.measuring;
  }

  private async measure(): Promise<SettingsSizes> {
    const { paths } = await this.overview();
    const sizes: SettingPathSize[] = [];
    // one at a time: the SD card and a USB stick don't like parallel walks
    for (const p of paths) {
      const usage = p.hostPath && p.exists ? await dirUsage(onHost(p.hostPath)) : null;
      const size: SettingPathSize = {
        key: p.key,
        bytes: usage?.bytes ?? null,
        files: usage?.files ?? 0,
        complete: usage?.complete ?? true,
        measuredAt: new Date().toISOString(),
      };
      this.cache.set(p.key, size);
      sizes.push(size);
    }
    return { sizes };
  }

  private toVar(key: string, raw: string | undefined, defaultValue: string | null, description: string): SettingVar {
    const value = raw ?? defaultValue ?? '';
    const secret = SECRET.test(key);
    return {
      key,
      value: secret || value === '' ? null : value,
      isSet: value !== '',
      secret,
      defaultValue: secret && defaultValue ? '' : defaultValue,
      description,
      changed: defaultValue !== null && value !== defaultValue,
    };
  }

  private async loadModules(): Promise<Module[]> {
    this.modules ??= await loadModules().catch(() => []);
    return this.modules;
  }

  private async version(): Promise<string | null> {
    try {
      const pkg = JSON.parse(await readFile(resolve(APPS_DIR, '..', 'package.json'), 'utf8')) as { version?: unknown };
      return typeof pkg.version === 'string' ? pkg.version : null;
    } catch {
      return null;
    }
  }
}
