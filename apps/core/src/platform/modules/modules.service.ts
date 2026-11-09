import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PodmanService } from './podman.service';
import { ModuleStatus } from './module-status.dto';
import { loadModules, Module } from './registry';
import { RuntimeService } from '../runtime/runtime.service';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'modules.json');

function installedIds(): Set<string> {
  const list = (process.env.MODULES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(list);
}


/**
 * The desired/actual state of every module: which are installed, switched on
 * or off (persisted to CORE_DATA_DIR/modules.json so a reboot doesn't start
 * something the user stopped), and their container's live state (from
 * RuntimeService). Starts and stops go through PodmanService, by container
 * name (offline-pi-<service>).
 */
@Injectable()
export class ModulesService implements OnModuleInit {
  private readonly logger = new Logger(ModulesService.name);
  /** every manifest, core included, nav order */
  modules: Module[] = [];
  private installed = new Set<string>();
  private off = new Set<string>();
  private busy = new Map<string, 'start' | 'stop'>();
  private errors = new Map<string, string>();

  constructor(
    private readonly podman: PodmanService,
    private readonly runtime: RuntimeService,
  ) {}

  async onModuleInit() {
    this.modules = await loadModules();
    this.installed = installedIds();
    this.off = await this.loadOff();
    void this.reconcile();
  }

  /** Module whose passthrough path (/svc/<path>) owns this request (installed and proxied, core excluded). */
  forPath(path: string): Module | undefined {
    return this.modules.find(
      (m) => this.installed.has(m.id) && m.upstream && (path === m.svcPath.slice(0, -1) || path.startsWith(m.svcPath)),
    );
  }

  get(id: string): Module | undefined {
    return this.modules.find((m) => m.id === id);
  }

  isInstalled(id: string): boolean {
    const m = this.get(id);
    return !!m && (!m.optional || this.installed.has(id));
  }

  /** The module's container runs (core itself always does). */
  isRunning(id: string): boolean {
    const m = this.get(id);
    if (!m) return false;
    if (!m.optional) return true;
    return this.isInstalled(id) && this.containerState(m).state === 'running';
  }

  /** requires[] entries that are still unset: a module can't start without them. */
  missing(m: Module): string[] {
    return m.requires.filter((key) => !process.env[key]);
  }

  private containerState(m: Module): { state: string; health: string | null } {
    const c = this.runtime.containers.list.find((x) => x.service === m.service || x.name === m.containerName);
    if (!c) return { state: 'missing', health: null };
    return { state: c.state, health: c.health };
  }

  list(): ModuleStatus[] {
    return this.modules.map((m) => {
      const installed = !m.optional || this.installed.has(m.id);
      const { state, health } = this.containerState(m);
      return {
        id: m.id,
        num: m.num,
        label: m.label,
        icon: m.icon,
        description: m.description,
        path: m.path,
        optional: m.optional,
        container: m.containerName,
        installed,
        enabled: installed && !this.off.has(m.id),
        busy: this.busy.get(m.id) ?? null,
        missing: this.missing(m),
        state,
        health,
        error: this.errors.get(m.id) ?? null,
      };
    });
  }

  async start(id: string): Promise<ModuleStatus> {
    return this.act(id, 'start');
  }

  async stop(id: string): Promise<ModuleStatus> {
    return this.act(id, 'stop');
  }

  private async act(id: string, action: 'start' | 'stop'): Promise<ModuleStatus> {
    const m = this.modules.find((x) => x.id === id);
    if (!m) throw new Error(`unknown module "${id}"`);
    if (!m.optional) throw new Error(`${m.label} is always on`);
    if (!this.installed.has(m.id)) throw new Error(`${m.label} is not installed: run ./install.sh`);
    if (action === 'start') {
      const missing = this.missing(m);
      if (missing.length) throw new Error(`${m.label} is not configured (${missing.join(', ')}): run ./install.sh`);
    }

    action === 'start' ? this.off.delete(m.id) : this.off.add(m.id);
    await this.saveOff();

    this.busy.set(m.id, action);
    this.errors.delete(m.id);
    try {
      await this.podman.run(m.containerName, action);
      await this.runtime.refresh();
    } catch (err) {
      const message = (err as Error).message;
      this.errors.set(m.id, message);
      this.busy.delete(m.id);
      throw new Error(message);
    }
    this.busy.delete(m.id);
    return this.list().find((x) => x.id === m.id)!;
  }

  /**
   * Brings every installed module to its desired (switched on/off) state,
   * dependsOn first so e.g. mesh-map doesn't come up before mesh.
   */
  async reconcile(): Promise<void> {
    await this.podman.ready;
    const order = this.dependencyOrder();
    for (const m of order) {
      if (!this.installed.has(m.id)) continue;
      const wantOn = !this.off.has(m.id);
      try {
        if (wantOn && !this.missing(m).length) await this.podman.run(m.containerName, 'start');
        else if (!wantOn) await this.podman.run(m.containerName, 'stop');
      } catch (err) {
        this.logger.warn(`${m.id}: ${(err as Error).message}`);
      }
    }
    await this.runtime.refresh();
  }

  private dependencyOrder(): Module[] {
    const byId = new Map(this.modules.map((m) => [m.id, m]));
    const seen = new Set<string>();
    const order: Module[] = [];
    const visit = (m: Module) => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      for (const dep of m.dependsOn) {
        const d = byId.get(dep);
        if (d) visit(d);
      }
      order.push(m);
    };
    for (const m of this.modules) visit(m);
    return order;
  }

  private async loadOff(): Promise<Set<string>> {
    try {
      const raw = await readFile(STATE_FILE, 'utf8');
      const json = JSON.parse(raw) as { off?: string[] };
      return new Set(json.off ?? []);
    } catch {
      return new Set();
    }
  }

  private async saveOff(): Promise<void> {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(STATE_FILE, JSON.stringify({ off: [...this.off] }), 'utf8');
    } catch (err) {
      this.logger.warn(`could not save ${STATE_FILE}: ${(err as Error).message}`);
    }
  }
}
