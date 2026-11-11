import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { arch, hostname, networkInterfaces, release } from 'node:os';
import { join } from 'node:path';
import { Subject } from 'rxjs';
import {
  HOST_PROC,
  HOST_ROOT,
  HOST_SYS,
  list,
  readDtString,
  readDtU32,
  readNumber,
  readText,
} from '../../../platform/host/host';
import { RuntimeService } from '../../../platform/runtime/runtime.service';
import { Snapshot, ThrottleFlags, ThrottleState } from '../domain/snapshot.dto';
import { Vcgencmd } from '../infrastructure/vcgencmd';
import { InternetService } from './internet.service';

const INTERVAL_MS = Math.max(500, Number(process.env.SAMPLE_INTERVAL_MS) || 2000);

interface CpuTimes {
  idle: number;
  total: number;
}

interface Counters {
  at: number;
  cpu: CpuTimes[]; // [0] = aggregate, then per core
  net: Map<string, { rx: number; tx: number }>;
  disk: { read: number; write: number } | null;
}

/** Device tree of the host (not masked like the container's /sys/firmware). */
const DT = join(HOST_SYS, 'firmware/devicetree/base');

/**
 * Samples the host every SAMPLE_INTERVAL_MS and publishes a Snapshot on
 * `snapshots$`. Everything is read from /proc, /sys and vcgencmd; anything a
 * given board doesn't expose is reported as null instead of failing.
 */
@Injectable()
export class CollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollectorService.name);
  private readonly vc = new Vcgencmd();
  private timer?: NodeJS.Timeout;
  private prev: Counters | null = null;
  private pmicSupported: boolean | null = null;
  private staticInfo?: { model: string | null; os: string | null; hostname: string };

  readonly snapshots$ = new Subject<Snapshot>();
  latest: Snapshot | null = null;

  constructor(
    private readonly runtime: RuntimeService,
    private readonly internet: InternetService,
  ) {}

  async onModuleInit() {
    this.staticInfo = {
      model: await readDtString(join(DT, 'model')),
      os: await this.readOsName(),
      hostname:
        (await readText(join(HOST_ROOT, 'etc/hostname')))?.trim() || hostname(),
    };
    this.logger.log(
      `Sampling every ${INTERVAL_MS} ms on ${this.staticInfo.model ?? 'unknown hardware'}`,
    );
    await this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  get intervalMs() {
    return INTERVAL_MS;
  }

  private async tick() {
    try {
      const snap = await this.collect();
      this.latest = snap;
      this.snapshots$.next(snap);
    } catch (err) {
      this.logger.error(`Sampling failed: ${(err as Error).stack ?? err}`);
    }
  }

  private async collect(): Promise<Snapshot> {
    const now = Date.now();
    const [cpuTimes, netCounters, diskCounters] = await Promise.all([
      this.readCpuTimes(),
      this.readNetCounters(),
      this.readDiskCounters(),
    ]);
    const prev = this.prev;
    const dt = prev ? (now - prev.at) / 1000 : 0;
    this.prev = { at: now, cpu: cpuTimes, net: netCounters, disk: diskCounters };

    const usage = (i: number): number | null => {
      const a = prev?.cpu[i];
      const b = cpuTimes[i];
      if (!a || !b || b.total <= a.total) return null;
      return round(100 * (1 - (b.idle - a.idle) / (b.total - a.total)), 1);
    };

    const [temps, fan, power, throttle, memory, disks, freq, load, uptime, procs, wifi] =
      await Promise.all([
        this.readTemps(),
        this.readFan(),
        this.readPower(),
        this.readThrottle(),
        this.readMemory(),
        this.readDisks(),
        this.readCpuFreq(),
        this.readLoad(),
        readText(join(HOST_PROC, 'uptime')),
        this.countProcesses(),
        this.readWifi(),
      ]);

    const network = [...netCounters].map(([iface, c]) => {
      const p = prev?.net.get(iface);
      return {
        iface,
        rxBps: p && dt > 0 ? Math.max(0, (c.rx - p.rx) / dt) : 0,
        txBps: p && dt > 0 ? Math.max(0, (c.tx - p.tx) / dt) : 0,
        rxTotal: c.rx,
        txTotal: c.tx,
      };
    });

    const diskIo =
      diskCounters && prev?.disk && dt > 0
        ? {
            readBps: Math.max(0, (diskCounters.read - prev.disk.read) / dt),
            writeBps: Math.max(0, (diskCounters.write - prev.disk.write) / dt),
          }
        : null;

    return {
      ts: now,
      system: {
        hostname: this.staticInfo!.hostname,
        model: this.staticInfo!.model,
        os: this.staticInfo!.os,
        kernel: release(),
        arch: arch(),
        uptimeSec: Number(uptime?.split(' ')[0] ?? 0),
        processes: procs,
        addresses: this.readAddresses(),
      },
      cpu: {
        usage: usage(0),
        cores: cpuTimes.slice(1).map((_, i) => usage(i + 1) ?? 0),
        freqMhz: freq.current,
        maxFreqMhz: freq.max,
        load,
      },
      temps,
      fan,
      power,
      throttle,
      memory,
      disks,
      diskIo,
      network,
      wifi,
      vcgencmd: this.vc.available,
      containers: this.runtime.containers,
      connections: this.runtime.connections,
      internet: this.internet.state,
    };
  }

  // ------------------------------------------------------------------ cpu --

  private async readCpuTimes(): Promise<CpuTimes[]> {
    const text = (await readText(join(HOST_PROC, 'stat'))) ?? '';
    return text
      .split('\n')
      .filter((l) => /^cpu\d*\s/.test(l))
      .map((l) => {
        const v = l.trim().split(/\s+/).slice(1).map(Number);
        // user nice system idle iowait irq softirq steal (guest is in user)
        const idle = v[3] + (v[4] ?? 0);
        const total = v.slice(0, 8).reduce((a, b) => a + (b || 0), 0);
        return { idle, total };
      });
  }

  private async readCpuFreq(): Promise<{ current: number[]; max: number | null }> {
    const base = join(HOST_SYS, 'devices/system/cpu');
    const cpus = (await list(base)).filter((d) => /^cpu\d+$/.test(d)).sort(byIndex);
    const current = await Promise.all(
      cpus.map((c) => readNumber(join(base, c, 'cpufreq/scaling_cur_freq'))),
    );
    const max = cpus.length
      ? await readNumber(join(base, cpus[0], 'cpufreq/cpuinfo_max_freq'))
      : null;
    return {
      current: current.map((k) => (k === null ? 0 : Math.round(k / 1000))),
      max: max === null ? null : Math.round(max / 1000),
    };
  }

  private async readLoad(): Promise<[number, number, number]> {
    const text = (await readText(join(HOST_PROC, 'loadavg'))) ?? '0 0 0';
    const [a, b, c] = text.split(' ').map(Number);
    return [a || 0, b || 0, c || 0];
  }

  private async countProcesses(): Promise<number | null> {
    const entries = await list(HOST_PROC);
    const n = entries.filter((e) => /^\d+$/.test(e)).length;
    return n || null;
  }

  // -------------------------------------------------------- temps & fan --

  private async readTemps(): Promise<Snapshot['temps']> {
    const sensors: { name: string; celsius: number }[] = [];
    const base = join(HOST_SYS, 'class/hwmon');
    for (const hw of (await list(base)).sort(byIndex)) {
      const name = (await readText(join(base, hw, 'name')))?.trim() ?? hw;
      const files = (await list(join(base, hw))).filter((f) => /^temp\d+_input$/.test(f));
      for (const f of files) {
        const milli = await readNumber(join(base, hw, f));
        if (milli !== null) sensors.push({ name: prettySensor(name), celsius: round(milli / 1000, 1) });
      }
    }
    let cpu = sensors.find((s) => s.name === 'CPU')?.celsius ?? null;
    if (cpu === null) {
      const milli = await readNumber(join(HOST_SYS, 'class/thermal/thermal_zone0/temp'));
      if (milli !== null) {
        cpu = round(milli / 1000, 1);
        sensors.unshift({ name: 'CPU', celsius: cpu });
      }
    }
    return { cpu, sensors };
  }

  private async readFan(): Promise<Snapshot['fan']> {
    const base = join(HOST_SYS, 'class/hwmon');
    for (const hw of await list(base)) {
      const rpm = await readNumber(join(base, hw, 'fan1_input'));
      if (rpm === null) continue;
      const pwm = await readNumber(join(base, hw, 'pwm1'));
      return { rpm, pwmPercent: pwm === null ? null : Math.round((pwm / 255) * 100) };
    }
    return null;
  }

  // -------------------------------------------------------------- power --

  private async readPower(): Promise<Snapshot['power']> {
    const power: Snapshot['power'] = {
      inputVolts: null,
      coreVolts: null,
      socWatts: null,
      rails: [],
      psuMaxCurrentMa: await readDtU32(join(DT, 'chosen/power/max_current')),
      usbHighCurrent: null,
      usbOverCurrent: null,
      underVoltageNow: null,
    };
    const usbMax = await readDtU32(join(DT, 'chosen/power/usb_max_current_enable'));
    if (usbMax !== null) power.usbHighCurrent = usbMax === 1;
    const usbOc = await readDtU32(join(DT, 'chosen/power/usb_over_current_detected'));
    if (usbOc !== null) power.usbOverCurrent = usbOc === 1;

    // rpi_volt hwmon: in0_lcrit_alarm = 1 while the supply is below ~4.63 V
    const hwBase = join(HOST_SYS, 'class/hwmon');
    for (const hw of await list(hwBase)) {
      if ((await readText(join(hwBase, hw, 'name')))?.trim() !== 'rpi_volt') continue;
      const alarm = await readNumber(join(hwBase, hw, 'in0_lcrit_alarm'));
      if (alarm !== null) power.underVoltageNow = alarm === 1;
    }

    // Pi 5: the PMIC ADC reports every rail, including the 5 V input
    if (this.pmicSupported !== false) {
      const out = await this.vc.run('pmic_read_adc');
      const rails = out ? parsePmic(out) : [];
      if (rails.length) {
        this.pmicSupported = true;
        power.rails = rails;
        power.inputVolts = rails.find((r) => r.name === 'EXT5V')?.volts ?? null;
        power.coreVolts = rails.find((r) => r.name === 'VDD_CORE')?.volts ?? null;
        const watts = rails.reduce(
          (sum, r) => (r.volts !== null && r.amps !== null ? sum + r.volts * r.amps : sum),
          0,
        );
        power.socWatts = round(watts, 2);
      } else if (out !== null || this.vc.available) {
        this.pmicSupported = false; // older Pi: fall back to measure_volts
      }
    }
    if (power.coreVolts === null && this.pmicSupported !== true) {
      const out = await this.vc.run('measure_volts', 'core');
      const m = out?.match(/volt=([\d.]+)V/);
      if (m) power.coreVolts = Number(m[1]);
    }
    return power;
  }

  private async readThrottle(): Promise<ThrottleState | null> {
    let raw: number | null = null;
    const out = await this.vc.run('get_throttled');
    const m = out?.match(/throttled=(0x[0-9a-f]+)/i);
    if (m) raw = parseInt(m[1], 16);
    if (raw === null) {
      // older kernels expose the same bit field in sysfs
      for (const dir of await list(join(HOST_SYS, 'devices/platform/soc'))) {
        if (!dir.endsWith(':firmware')) continue;
        const text = await readText(join(HOST_SYS, 'devices/platform/soc', dir, 'get_throttled'));
        if (text) raw = parseInt(text.trim(), 16);
      }
    }
    if (raw === null || Number.isNaN(raw)) return null;
    const flags = (shift: number): ThrottleFlags => ({
      underVoltage: Boolean(raw! & (1 << shift)),
      freqCapped: Boolean(raw! & (1 << (shift + 1))),
      throttled: Boolean(raw! & (1 << (shift + 2))),
      softTempLimit: Boolean(raw! & (1 << (shift + 3))),
    });
    return { raw: '0x' + raw.toString(16), now: flags(0), sinceBoot: flags(16) };
  }

  // ------------------------------------------------------ memory & disk --

  private async readMemory(): Promise<Snapshot['memory']> {
    const text = await readText(join(HOST_PROC, 'meminfo'));
    if (!text) return null;
    const kb = (key: string) => {
      const m = text.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return m ? Number(m[1]) * 1024 : 0;
    };
    const total = kb('MemTotal');
    const available = kb('MemAvailable');
    const swapTotal = kb('SwapTotal');
    return {
      total,
      available,
      used: total - available,
      swapTotal,
      swapUsed: swapTotal - kb('SwapFree'),
    };
  }

  private async readDisks(): Promise<Snapshot['disks']> {
    // pid 1's mount table is the host's (we run with pid: host)
    const text =
      (await readText(join(HOST_PROC, '1/mounts'))) ??
      (await readText(join(HOST_PROC, 'mounts'))) ??
      '';
    const seen = new Set<string>();
    const disks: Snapshot['disks'] = [];
    for (const line of text.split('\n')) {
      const [device, rawMount, fstype] = line.split(' ');
      if (!device?.startsWith('/dev/') || device.startsWith('/dev/loop') || seen.has(device)) continue;
      const mount = rawMount.replace(/\\040/g, ' ');
      seen.add(device);
      try {
        const s = await statfs(join(HOST_ROOT, mount));
        const total = s.blocks * s.bsize;
        if (!total) continue;
        const free = s.bavail * s.bsize;
        disks.push({ mount, device, fstype, total, free, used: total - s.bfree * s.bsize });
      } catch {
        // mount not visible from the container (e.g. unplugged drive)
      }
    }
    return disks;
  }

  private async readDiskCounters(): Promise<{ read: number; write: number } | null> {
    const text = await readText(join(HOST_PROC, 'diskstats'));
    if (!text) return null;
    const whole = new Set(await list(join(HOST_SYS, 'block')));
    let read = 0;
    let write = 0;
    for (const line of text.split('\n')) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10 || !whole.has(f[2]) || /^(loop|ram|zram)/.test(f[2])) continue;
      read += Number(f[5]) * 512;
      write += Number(f[9]) * 512;
    }
    return { read, write };
  }

  // ------------------------------------------------------------ network --

  private async readNetCounters(): Promise<Map<string, { rx: number; tx: number }>> {
    const map = new Map<string, { rx: number; tx: number }>();
    const text = await readText(join(HOST_PROC, 'net/dev'));
    if (!text) return map;
    for (const line of text.split('\n').slice(2)) {
      const [name, rest] = line.split(':');
      if (!rest) continue;
      const iface = name.trim();
      // only physical NICs (skip lo, podman bridges, veths, tunnels)
      const physical = (await list(join(HOST_SYS, 'class/net', iface, 'device'))).length > 0;
      if (!physical) continue;
      const v = rest.trim().split(/\s+/).map(Number);
      map.set(iface, { rx: v[0], tx: v[8] });
    }
    return map;
  }

  private async readWifi(): Promise<Snapshot['wifi']> {
    const text = await readText(join(HOST_PROC, 'net/wireless'));
    const line = text?.split('\n').slice(2).find((l) => l.includes(':'));
    if (!line) return null;
    const [iface, rest] = line.split(':');
    const v = rest.trim().split(/\s+/);
    const quality = parseFloat(v[1]);
    const signalDbm = parseFloat(v[2]);
    if (!Number.isFinite(signalDbm)) return null;
    return { iface: iface.trim(), signalDbm, quality: Math.round((quality / 70) * 100) };
  }

  private readAddresses() {
    const out: { iface: string; address: string }[] = [];
    for (const [iface, addrs] of Object.entries(networkInterfaces())) {
      if (iface === 'lo' || /^(podman|veth|cni|docker|br-)/.test(iface)) continue;
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) out.push({ iface, address: a.address });
      }
    }
    return out;
  }

  private async readOsName(): Promise<string | null> {
    const text = await readText(join(HOST_ROOT, 'etc/os-release'));
    const m = text?.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    return m ? m[1] : null;
  }
}

/** Parses `vcgencmd pmic_read_adc` lines like ` EXT5V_V volt(24)=5.13020000V`. */
export function parsePmic(out: string) {
  const rails = new Map<string, { name: string; volts: number | null; amps: number | null }>();
  for (const m of out.matchAll(/^\s*(\S+)_([AV])\s+(?:current|volt)\(\d+\)=([\d.]+)[AV]/gm)) {
    const [, name, unit, value] = m;
    const rail = rails.get(name) ?? { name, volts: null, amps: null };
    if (unit === 'V') rail.volts = Number(value);
    else rail.amps = Number(value);
    rails.set(name, rail);
  }
  return [...rails.values()];
}

function prettySensor(name: string) {
  if (name === 'cpu_thermal') return 'CPU';
  if (name === 'rp1_adc') return 'RP1 I/O chip';
  return name.replace(/_/g, ' ');
}

function byIndex(a: string, b: string) {
  return Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, ''));
}

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
