import { Injectable } from '@nestjs/common';
import type { Stats } from 'node:fs';
import { lstat, opendir, stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { HOST_ROOT } from '../../../platform/host/host';
import { ModulesService } from '../../../platform/modules/modules.service';
import { PodmanService } from '../../../platform/modules/podman.service';
import { RuntimeService } from '../../../platform/runtime/runtime.service';
import { UpstreamService } from '../../../platform/upstream/upstream.service';
import { SettingsService } from '../../settings/application/settings.service';
import { mountOf, readMounts, space, type MountInfo } from '../../settings/infrastructure/disk';
import { onHost, projectDir, readEnvFile } from '../../settings/infrastructure/env-files';
import { CollectorService } from '../../system/application/collector.service';
import { InternetService } from '../../system/application/internet.service';
import { DiagCheck, DiagCounts, DiagnosticsReport } from '../domain/diagnostics.dto';
import { usbStorageEntry } from '../infrastructure/fstab';
import { hostUser, IdMapper, type HostUser } from '../infrastructure/host-users';

type Status = DiagCheck['status'];
type Group = DiagCheck['group'];

const GB = 1024 ** 3;
/** How long a module may take to answer its health endpoint. */
const PROBE_TIMEOUT_MS = 4_000;
/** Direct children of a data folder checked for ownership (cheap, catches `sudo` leftovers). */
const MAX_CHILDREN = 200;

const fmtBytes = (n: number) => (n >= GB ? `${(n / GB).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const fmtAgo = (ms: number) => {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
};
const mode = (m: number) => (m & 0o777).toString(8).padStart(3, '0');
/** `chown` owner argument for the user (name and login group when known). */
const owner = (u: HostUser) => (u.name ? `${u.name}:` : u.gids.length ? `${u.uid}:${u.gids[0]}` : `${u.uid}`);
/** Shell commands that make a folder tree the user's and writable for it. */
const repair = (u: HostUser, path: string) => `\`sudo chown -R ${owner(u)} ${path} && sudo chmod -R u+rwX ${path}\``;
const who = (u: HostUser) => u.name ?? `uid ${u.uid}`;

/** Free-space level of a drive: fail below 1 GB or 2 %, warn below 3 GB or 5 %. */
function spaceStatus(free: number, total: number): Status {
  const ratio = total > 0 ? free / total : 1;
  if (free < GB || ratio < 0.02) return 'fail';
  if (free < 3 * GB || ratio < 0.05) return 'warn';
  return 'ok';
}

function check(
  group: Group,
  id: string,
  title: string,
  status: Status,
  summary: string,
  opts: {
    details?: (string | null | false | undefined)[];
    fix?: string | null;
    module?: string | null;
  } = {},
): DiagCheck {
  return {
    id,
    group,
    title,
    status,
    summary,
    details: (opts.details ?? []).filter((d): d is string => typeof d === 'string' && d !== ''),
    fix: opts.fix ?? null,
    module: opts.module ?? null,
  };
}

/** The worse of two statuses. */
const ORDER: Status[] = ['ok', 'info', 'warn', 'fail'];
const worst = (a: Status, b: Status): Status => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/**
 * Troubleshooting: runs every check on request and says, per part of
 * outpost, whether it works and what to do when not. Read only; nothing is
 * repaired from here (the fixes are commands for the Pi's terminal).
 */
@Injectable()
export class DiagnosticsService {
  private running: Promise<DiagnosticsReport> | null = null;

  constructor(
    private readonly modules: ModulesService,
    private readonly podman: PodmanService,
    private readonly runtime: RuntimeService,
    private readonly upstream: UpstreamService,
    private readonly settings: SettingsService,
    private readonly collector: CollectorService,
    private readonly internet: InternetService,
  ) {}

  /** Runs every check; parallel requests share one run. */
  run(): Promise<DiagnosticsReport> {
    this.running ??= this.runAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runAll(): Promise<DiagnosticsReport> {
    const started = Date.now();
    await this.runtime.refresh();
    const [overview, mounts, ids] = await Promise.all([this.settings.overview(), readMounts(), IdMapper.load()]);
    const user = await hostUser(ids);

    const checks = [
      ...(await this.setup(overview.version)),
      ...(await this.moduleChecks()),
      ...(await this.storage(overview.paths, mounts, ids, user)),
      ...this.host(),
    ];
    const counts: DiagCounts = { ok: 0, info: 0, warn: 0, fail: 0 };
    for (const c of checks) counts[c.status]++;
    return {
      checkedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      version: overview.version,
      hostname: this.collector.latest?.system.hostname ?? hostname(),
      counts,
      checks,
    };
  }

  // ---------------------------------------------------------------- setup --

  private async setup(version: string | null): Promise<DiagCheck[]> {
    const out: DiagCheck[] = [];
    const project = projectDir();
    const env = await readEnvFile();
    if (!project) {
      out.push(
        check('setup', 'env', 'Configuration (.env)', 'warn', 'Core does not know the project folder', {
          details: ['OUTPOST_DIR is not set, so .env and relative data folders cannot be read.'],
          fix: 'Rebuild with ./start.sh (it passes the project folder to core).',
        }),
      );
    } else if (!env) {
      out.push(
        check('setup', 'env', 'Configuration (.env)', 'fail', `No readable .env in ${project}`, {
          fix: 'Run ./install.sh in the project folder.',
        }),
      );
    } else {
      const installed = (env.values.get('MODULES') ?? '').split(',').filter(Boolean);
      out.push(
        check('setup', 'env', 'Configuration (.env)', 'ok', `${env.path}, ${env.values.size} values`, {
          details: [
            `Installed modules: ${installed.length ? installed.join(', ') : 'none'}`,
            version && `outpost version ${version}`,
          ],
        }),
      );
    }

    const podmanError = await this.podman.ping();
    out.push(
      podmanError
        ? check('setup', 'podman', 'Podman control', 'fail', 'Core cannot start or stop modules', {
            details: [podmanError, process.env.PODMAN_SOCKET && `PODMAN_SOCKET=${process.env.PODMAN_SOCKET}`],
            fix: 'Check `systemctl --user status podman.socket` on the Pi, then re-run ./install.sh.',
          })
        : check('setup', 'podman', 'Podman control', 'ok', 'podman.socket answers', {
            details: [process.env.PODMAN_SOCKET],
          }),
    );

    const c = this.runtime.containers;
    out.push(
      c.available
        ? check('setup', 'containers', 'Container list', 'ok', `${c.list.length} containers known to podman`)
        : check('setup', 'containers', 'Container list', 'warn', 'Container states cannot be read', {
            details: [c.error],
            fix: 'Needs Podman 4.8 or newer with the sqlite database. Module states below may be wrong.',
          }),
    );

    out.push(
      process.env.CONTROL_PIN
        ? check('setup', 'pin', 'Control PIN', 'ok', 'Starting and stopping modules needs the PIN')
        : check(
            'setup',
            'pin',
            'Control PIN',
            'info',
            'No control PIN: anyone on the network can start and stop modules',
            {
              fix: 'Set one with ./install.sh if others use this network.',
            },
          ),
    );

    const year = new Date().getUTCFullYear();
    const synced = await exists(join(HOST_ROOT, 'run/systemd/timesync/synchronized'));
    if (year < 2025) {
      out.push(
        check('setup', 'clock', 'Clock', 'fail', `The clock says ${new Date().toISOString().slice(0, 10)}`, {
          details: ['The Pi has no clock battery and has not reached a time server since it started.'],
          fix: 'Connect it to the internet once, or set the time: sudo date -s "YYYY-MM-DD HH:MM".',
        }),
      );
    } else {
      out.push(
        check(
          'setup',
          'clock',
          'Clock',
          synced ? 'ok' : 'info',
          synced ? 'Synchronised with a time server' : 'Not synchronised since boot',
          {
            details: [
              `UTC ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
              !synced && 'Normal without internet; the time may be off after a long power cut.',
            ],
          },
        ),
      );
    }
    return out;
  }

  // -------------------------------------------------------------- modules --

  private async moduleChecks(): Promise<DiagCheck[]> {
    const list = this.modules.list().filter((m) => m.optional);
    const results = await Promise.all(list.map((m) => this.moduleCheck(m.id)));
    const out = results.filter((c): c is DiagCheck => c !== null);
    const radio = await this.meshDevice();
    if (radio) out.push(radio);
    return out;
  }

  private async moduleCheck(id: string): Promise<DiagCheck | null> {
    const m = this.modules.list().find((x) => x.id === id)!;
    const module = this.modules.get(id)!;
    const title = m.label;
    const cid = `module:${id}`;
    if (!m.installed) {
      return check('modules', cid, title, 'info', 'Not installed', {
        module: id,
        fix: 'To add it, run ./install.sh and select it.',
      });
    }
    if (m.missing.length) {
      return check('modules', cid, title, 'fail', `Not configured: ${m.missing.join(', ')} is empty`, {
        module: id,
        fix: 'Run ./install.sh to configure it.',
      });
    }
    if (m.state === 'missing') {
      return check('modules', cid, title, 'fail', `No container ${m.container}`, {
        module: id,
        details: [m.error],
        fix: 'Run ./start.sh to build and create it.',
      });
    }
    const c = this.runtime.containers.list.find((x) => x.name === m.container || x.service === module.service);
    const details: (string | null)[] = [m.error && `Last start/stop failed: ${m.error}`];
    if (!m.enabled) {
      return check('modules', cid, title, 'info', `Switched off (container ${m.state})`, {
        module: id,
        details,
        fix: 'Start it on the System screen when you need it.',
      });
    }
    if (m.state !== 'running') {
      const ended = c?.finishedAt ? ` ${fmtAgo(Date.now() - c.finishedAt)} ago` : '';
      return check(
        'modules',
        cid,
        title,
        'fail',
        `Container is ${m.state}${c?.exitCode != null ? ` (exit code ${c.exitCode})` : ''}`,
        {
          module: id,
          details: [...details, ended && `Stopped${ended}.`],
          fix: `See why on the Logs screen (${m.container}), then press START on the System screen.`,
        },
      );
    }

    let status: Status = 'ok';
    const up = c?.startedAt ? `up ${fmtAgo(Date.now() - c.startedAt)}` : 'running';
    let summary = up;
    if (m.health === 'unhealthy') {
      status = 'fail';
      summary = `Running but unhealthy (${up})`;
    } else if (m.health === 'starting') {
      status = 'warn';
      summary = `Starting (${up})`;
    }
    if (c?.startedAt && Date.now() - c.startedAt < 5 * 60_000 && status === 'ok') {
      details.push('Started only minutes ago: if this keeps happening it is restarting after crashes.');
      status = 'info';
    }

    if (module.upstream && module.health) {
      const t0 = Date.now();
      try {
        await this.upstream.client(id).fetch('GET', module.health, { timeoutMs: PROBE_TIMEOUT_MS });
        details.push(`Answers ${module.health} in ${Date.now() - t0} ms.`);
      } catch (err) {
        status = 'fail';
        summary = `Running but does not answer (${up})`;
        details.push(`${module.upstream}${module.health}: ${(err as Error).message}`);
      }
    }
    return check('modules', cid, title, status, summary, {
      module: id,
      details: [...details, c?.memoryBytes != null && `Memory ${fmtBytes(c.memoryBytes)}`],
      fix: status === 'fail' ? `See the Logs screen (${m.container}); restart it on the System screen.` : null,
    });
  }

  /** Mesh's USB radio: it must exist on the Pi (at its stable /dev/serial/by-id/ path). */
  private async meshDevice(): Promise<DiagCheck | null> {
    if (!this.modules.isInstalled('mesh')) return null;
    const conn = process.env.MESH_CONNECTION || 'serial';
    if (conn !== 'serial') {
      const host = process.env.MESH_HOST;
      return check(
        'modules',
        'mesh:radio',
        'Mesh radio',
        host ? 'ok' : 'fail',
        host ? `Network node at ${host}` : 'MESH_HOST is empty',
        {
          module: 'mesh',
          fix: host ? null : 'Run ./install.sh to set the node address.',
        },
      );
    }
    const device = process.env.MESH_DEVICE ?? '';
    if (!device || device === '/dev/null') {
      return check('modules', 'mesh:radio', 'Mesh radio', 'fail', 'No radio chosen (MESH_DEVICE is empty)', {
        module: 'mesh',
        fix: 'Plug in the radio and run ./install.sh to pick it.',
      });
    }
    const found = await exists(onHost(device));
    return check(
      'modules',
      'mesh:radio',
      'Mesh radio',
      found ? 'ok' : 'fail',
      found ? 'USB radio connected' : 'USB radio not found',
      {
        module: 'mesh',
        details: [device],
        fix: found ? null : 'Plug the radio in (try another cable or port). A different radio needs ./install.sh.',
      },
    );
  }

  // -------------------------------------------------------------- storage --

  private async storage(
    paths: Awaited<ReturnType<SettingsService['overview']>>['paths'],
    mounts: MountInfo[],
    ids: IdMapper,
    user: HostUser | null,
  ): Promise<DiagCheck[]> {
    const out: DiagCheck[] = [];
    const usb = await usbStorageEntry();
    if (usb) {
      const mounted = mounts.find((m) => m.mountPoint === usb.mountPoint);
      out.push(
        mounted
          ? check('storage', 'usb', 'USB drive', 'ok', `Mounted at ${usb.mountPoint}`, {
              details: [`${mounted.device} · ${mounted.fsType}`, usb.source],
            })
          : check('storage', 'usb', 'USB drive', 'fail', `Not mounted at ${usb.mountPoint}`, {
              details: [`Set up by host/usb-storage for ${usb.source}.`],
              fix: `Plug the drive in. If it is plugged in: sudo mount ${usb.mountPoint} and look at journalctl -b | grep -i ${usb.mountPoint.split('/').pop()}.`,
            }),
      );
    }
    const installed = paths.filter((p) => p.installed);
    for (const p of installed) out.push(await this.dirCheck(p, mounts, ids, user));

    // free space once per drive the data folders are on
    const drives = new Map<string, { mount: MountInfo; keys: string[]; probe: string }>();
    for (const p of installed) {
      if (!p.hostPath || !p.exists) continue;
      const mount = mountOf(p.hostPath, mounts) ?? {
        device: '',
        mountPoint: '/',
        fsType: '',
        options: [],
      };
      const d = drives.get(mount.mountPoint) ?? {
        mount,
        keys: [],
        probe: p.hostPath,
      };
      d.keys.push(p.key);
      drives.set(mount.mountPoint, d);
    }
    // the system disk always: podman's images and containers live there too
    if (!drives.has('/')) {
      const root = mounts.find((m) => m.mountPoint === '/') ?? { device: '', mountPoint: '/', fsType: '', options: [] };
      drives.set('/', { mount: root, keys: [], probe: '/' });
    }
    for (const [mp, d] of drives) {
      const fs = await space(onHost(d.probe));
      if (!fs || fs.total <= 0) continue;
      const status = spaceStatus(fs.free, fs.total);
      const name = mp === '/' ? 'System disk (/)' : `Drive ${mp}`;
      out.push(
        check('storage', `drive:${mp}`, name, status, `${fmtBytes(fs.free)} free of ${fmtBytes(fs.total)}`, {
          details: [d.mount.device && `${d.mount.device} · ${d.mount.fsType}`, `Holds ${d.keys.join(', ')}`],
          fix:
            status === 'fail'
              ? 'Almost full: delete map regions or library books, or move data folders to a bigger drive with ./install.sh.'
              : status === 'warn'
                ? 'Getting full: large downloads may fail.'
                : null,
        }),
      );
    }
    return out;
  }

  private async dirCheck(
    p: Awaited<ReturnType<SettingsService['overview']>>['paths'][number],
    mounts: MountInfo[],
    ids: IdMapper,
    user: HostUser | null,
  ): Promise<DiagCheck> {
    const base = { module: p.module };
    const id = `dir:${p.key}`;
    if (!p.hostPath) {
      return check('storage', id, p.key, 'warn', `Relative path ${p.value} cannot be resolved`, {
        ...base,
        fix: 'Rebuild with ./start.sh so core knows the project folder.',
      });
    }
    const mount = mountOf(p.hostPath, mounts);
    const onDriveMountPoint = /^\/(media|mnt)\/[^/]+/.exec(p.hostPath)?.[0] ?? null;
    const driveMissing =
      onDriveMountPoint !== null &&
      (!mount || mount.mountPoint === '/' || !mount.mountPoint.startsWith(onDriveMountPoint));

    if (!p.exists) {
      return check('storage', id, p.key, 'fail', `Folder missing: ${p.hostPath}`, {
        ...base,
        details: [driveMissing && `Nothing is mounted at ${onDriveMountPoint}.`],
        fix: driveMissing
          ? `Plug in and mount the drive (${onDriveMountPoint}), then ./start.sh.`
          : 'Run ./install.sh: it creates the folder (or choose another).',
      });
    }

    let status: Status = 'ok';
    const details: string[] = [p.hostPath];
    const fixes: string[] = [];
    let notWritable = false;
    if (mount) details.push(`On ${mount.mountPoint} (${mount.device}, ${mount.fsType})`);

    if (driveMissing) {
      status = 'fail';
      details.push(`Nothing is mounted at ${onDriveMountPoint}: this folder is on the SD card, not on the drive.`);
      fixes.push(`Mount the drive at ${onDriveMountPoint} (and restart the module) before downloading more.`);
    }
    if (mount?.options.includes('ro')) {
      status = 'fail';
      details.push(`${mount.mountPoint} is mounted read-only (often a file system error).`);
      fixes.push(`Check the drive (sudo fsck) and remount it: sudo mount -o remount,rw ${mount.mountPoint}.`);
    }

    // permissions: the containers write as the Pi user that runs podman
    try {
      const st = await stat(onHost(p.hostPath));
      const ownerUid = ids.uid(st.uid);
      const ownerGid = ids.gid(st.gid);
      details.push(`Owner ${ownerUid ?? 'other (e.g. root)'}:${ownerGid ?? 'other'}, mode ${mode(st.mode)}`);
      if (user) {
        if (!writable(st, ownerUid, ownerGid, user)) {
          status = 'fail';
          notWritable = true;
          details.push(`Not writable for ${who(user)}, the user the containers write as.`);
          fixes.push(`Give it to that user: ${repair(user, p.hostPath)}`);
        } else {
          const bad = await foreignChildren(onHost(p.hostPath), ids, user);
          if (bad.count) {
            status = worst(status, 'warn');
            details.push(
              `${bad.count} item(s) inside are not writable for ${who(user)}, e.g. ${bad.examples.join(', ')}.`,
            );
            fixes.push(`Give them to that user: ${repair(user, p.hostPath)}`);
          }
        }
      }
    } catch (err) {
      status = 'fail';
      details.push(`Cannot read the folder: ${(err as Error).message}`);
    }

    let summary = user ? 'Exists and writable' : 'Exists';
    if (mount && mount.mountPoint !== '/') summary += ` · on ${mount.mountPoint}`;
    if (notWritable) summary = 'Not writable for the containers';
    else if (driveMissing) summary = `On the SD card instead of ${onDriveMountPoint}`;
    else if (mount?.options.includes('ro')) summary = 'Read-only drive';
    else if (status === 'warn') summary = 'Some files inside are not writable';

    return check('storage', id, p.key, status, summary, {
      ...base,
      details,
      fix: fixes.join('\n') || null,
    });
  }

  // ----------------------------------------------------------------- host --

  private host(): DiagCheck[] {
    const s = this.collector.latest;
    if (!s) return [check('host', 'host', 'Host vitals', 'warn', 'Not sampled yet: try again in a few seconds')];
    const out: DiagCheck[] = [];

    const t = s.temps.cpu;
    if (t != null) {
      const status: Status = t >= 80 ? 'fail' : t >= 70 ? 'warn' : 'ok';
      out.push(
        check('host', 'temp', 'CPU temperature', status, `${t.toFixed(0)} °C`, {
          fix: status === 'ok' ? null : 'Give the Pi air or a fan; above 80 °C it slows itself down.',
        }),
      );
    }

    const th = s.throttle;
    const uvNow = s.power.underVoltageNow ?? th?.now.underVoltage ?? false;
    if (th || s.power.inputVolts != null || uvNow) {
      let status: Status = 'ok';
      let summary =
        s.power.inputVolts != null
          ? `${s.power.inputVolts.toFixed(2)} V input, no problems since boot`
          : 'No problems since boot';
      const details: string[] = [];
      if (th?.sinceBoot.underVoltage) {
        status = 'warn';
        summary = 'Under-voltage happened since boot';
      }
      if (th?.now.throttled || th?.now.freqCapped) {
        status = worst(status, 'warn');
        details.push('The CPU is slowed down right now.');
      }
      if (uvNow) {
        status = 'fail';
        summary = 'Under-voltage right now';
      }
      if (s.power.psuMaxCurrentMa != null)
        details.push(`Power supply reports ${(s.power.psuMaxCurrentMa / 1000).toFixed(1)} A.`);
      if (th) details.push(`get_throttled ${th.raw}`);
      out.push(
        check('host', 'power', 'Power supply', status, summary, {
          details,
          fix:
            status === 'ok'
              ? null
              : 'Use the official 5 V / 5 A supply and a short cable; USB drives and radios draw extra power. Under-voltage corrupts data and makes drives disconnect.',
        }),
      );
    }

    const m = s.memory;
    if (m && m.total > 0) {
      const ratio = m.available / m.total;
      const status: Status = ratio < 0.05 ? 'fail' : ratio < 0.1 ? 'warn' : 'ok';
      out.push(
        check('host', 'memory', 'Memory', status, `${fmtBytes(m.available)} available of ${fmtBytes(m.total)}`, {
          details: [m.swapTotal > 0 ? `Swap ${fmtBytes(m.swapUsed)} used of ${fmtBytes(m.swapTotal)}` : 'No swap'],
          fix: status === 'ok' ? null : 'Stop modules you do not need on the System screen.',
        }),
      );
    }

    const up = s.system.uptimeSec;
    if (up > 0)
      out.push(
        check('host', 'uptime', 'Uptime', up < 600 ? 'info' : 'ok', `Up ${fmtAgo(up * 1000)}`, {
          details: [up < 600 && 'The Pi started only minutes ago. If you did not restart it, check the power supply.'],
        }),
      );

    const net = this.internet.state;
    if (net.state !== 'disabled') {
      out.push(
        check(
          'host',
          'internet',
          'Internet',
          net.state === 'online' ? 'ok' : 'info',
          net.state === 'online'
            ? `Online (${net.target} in ${net.latencyMs} ms)`
            : net.state === 'checking'
              ? 'Checking'
              : 'Offline',
          {
            details: [net.state === 'offline' && 'Fine for using outpost; downloading maps and books needs internet.'],
          },
        ),
      );
    }
    return out;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Write and enter permission for the user, from owner, group and other bits. */
function writable(st: Stats, ownerUid: number | null, ownerGid: number | null, user: HostUser): boolean {
  if (user.uid === 0) return true;
  const m = st.mode;
  if (ownerUid === user.uid) return (m & 0o300) === 0o300;
  if (ownerGid !== null && user.gids.includes(ownerGid)) return (m & 0o030) === 0o030;
  return (m & 0o003) === 0o003;
}

/** Direct children the user cannot write (left behind by `sudo`, for example). */
async function foreignChildren(
  dir: string,
  ids: IdMapper,
  user: HostUser,
): Promise<{ count: number; examples: string[] }> {
  const examples: string[] = [];
  let count = 0;
  let seen = 0;
  try {
    const handle = await opendir(dir);
    for await (const entry of handle) {
      if (++seen > MAX_CHILDREN) break;
      try {
        const st = await lstat(join(dir, entry.name));
        if (st.isSymbolicLink()) continue;
        const ok = st.isDirectory()
          ? writable(st, ids.uid(st.uid), ids.gid(st.gid), user)
          : ownerCanWrite(st, ids, user);
        if (!ok) {
          count++;
          if (examples.length < 3) examples.push(entry.name);
        }
      } catch {
        // vanished
      }
    }
  } catch {
    // unreadable: reported by the caller's stat
  }
  return { count, examples };
}

function ownerCanWrite(st: Stats, ids: IdMapper, user: HostUser): boolean {
  if (user.uid === 0) return true;
  const uid = ids.uid(st.uid);
  const gid = ids.gid(st.gid);
  if (uid === user.uid) return (st.mode & 0o200) !== 0;
  if (gid !== null && user.gids.includes(gid)) return (st.mode & 0o020) !== 0;
  return (st.mode & 0o002) !== 0;
}
