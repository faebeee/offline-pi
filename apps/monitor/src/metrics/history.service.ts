import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Subscription } from 'rxjs';
import { CollectorService } from './collector.service';
import { HistoryPoint, PowerEvent, Snapshot, ThrottleFlags } from './types';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const FILE = join(DATA_DIR, 'history.json');
const LIVE_WINDOW_MS = 15 * 60_000;
const LONG_WINDOW_MS = 24 * 60 * 60_000;
const BUCKET_MS = 60_000;
const MAX_EVENTS = 200;
const SAVE_EVERY_MS = 5 * 60_000;

const EVENT_FLAGS: [keyof ThrottleFlags, PowerEvent['kind']][] = [
  ['underVoltage', 'under-voltage'],
  ['throttled', 'throttled'],
  ['freqCapped', 'freq-capped'],
  ['softTempLimit', 'soft-temp-limit'],
];

/**
 * Keeps two ring buffers of compact samples: every tick for the last
 * 15 minutes (in memory), and one point per minute for 24 hours (persisted
 * to $DATA_DIR/history.json so a restart doesn't wipe the day). Also logs
 * power events (under-voltage, throttling) as their live flags change.
 */
@Injectable()
export class HistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HistoryService.name);
  private sub?: Subscription;
  private saveTimer?: NodeJS.Timeout;
  private bucket: Snapshot[] = [];
  private lastFlags: ThrottleFlags | null = null;

  live: HistoryPoint[] = [];
  minutes: HistoryPoint[] = [];
  events: PowerEvent[] = [];

  constructor(private readonly collector: CollectorService) {}

  async onModuleInit() {
    await this.load();
    this.sub = this.collector.snapshots$.subscribe((s) => this.add(s));
    this.saveTimer = setInterval(() => void this.save(), SAVE_EVERY_MS);
  }

  async onModuleDestroy() {
    this.sub?.unsubscribe();
    clearInterval(this.saveTimer);
    this.flushBucket();
    await this.save();
  }

  private add(s: Snapshot) {
    this.live.push(toPoint(s));
    const liveCutoff = s.ts - LIVE_WINDOW_MS;
    while (this.live.length && this.live[0].t < liveCutoff) this.live.shift();

    if (this.bucket.length && Math.floor(this.bucket[0].ts / BUCKET_MS) !== Math.floor(s.ts / BUCKET_MS)) {
      this.flushBucket();
    }
    this.bucket.push(s);

    const flags = s.throttle?.now;
    if (flags) {
      for (const [key, kind] of EVENT_FLAGS) {
        const was = this.lastFlags?.[key] ?? false;
        if (flags[key] !== was) {
          this.events.push({ t: s.ts, kind, active: flags[key] });
          if (flags[key]) this.logger.warn(`${kind} detected (throttled=${s.throttle!.raw})`);
        }
      }
      if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
      this.lastFlags = flags;
    }
  }

  /** The newest point of the minute series, possibly still in progress. */
  private flushBucket() {
    if (!this.bucket.length) return;
    const pts = this.bucket.map(toPoint);
    const t = Math.floor(this.bucket[0].ts / BUCKET_MS) * BUCKET_MS;
    this.bucket = [];
    this.minutes.push({
      t,
      cpu: avg(pts.map((p) => p.cpu)),
      temp: max(pts.map((p) => p.temp)),
      // keep the dip: a brief sag is what matters for power problems
      volt: min(pts.map((p) => p.volt)),
      mem: avg(pts.map((p) => p.mem)),
      rx: avg(pts.map((p) => p.rx)),
      tx: avg(pts.map((p) => p.tx)),
    });
    const cutoff = Date.now() - LONG_WINDOW_MS;
    while (this.minutes.length && this.minutes[0].t < cutoff) this.minutes.shift();
  }

  private async load() {
    try {
      const data = JSON.parse(await readFile(FILE, 'utf8'));
      const cutoff = Date.now() - LONG_WINDOW_MS;
      this.minutes = (data.minutes ?? []).filter((p: HistoryPoint) => p.t >= cutoff);
      this.events = data.events ?? [];
      this.logger.log(`Loaded ${this.minutes.length} minutes of history from ${FILE}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not read ${FILE}: ${(err as Error).message}`);
      }
    }
  }

  private async save() {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      await writeFile(tmp, JSON.stringify({ minutes: this.minutes, events: this.events }));
      await rename(tmp, FILE);
    } catch (err) {
      this.logger.warn(`Could not save history to ${FILE}: ${(err as Error).message}`);
    }
  }
}

function toPoint(s: Snapshot): HistoryPoint {
  const net = s.network.reduce((a, n) => ({ rx: a.rx + n.rxBps, tx: a.tx + n.txBps }), { rx: 0, tx: 0 });
  return {
    t: s.ts,
    cpu: s.cpu.usage,
    temp: s.temps.cpu,
    volt: s.power.inputVolts,
    mem: s.memory ? Math.round((s.memory.used / s.memory.total) * 1000) / 10 : null,
    rx: Math.round(net.rx),
    tx: Math.round(net.tx),
  };
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
function avg(xs: (number | null)[]) {
  const v = nums(xs);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}
function max(xs: (number | null)[]) {
  const v = nums(xs);
  return v.length ? Math.max(...v) : null;
}
function min(xs: (number | null)[]) {
  const v = nums(xs);
  return v.length ? Math.min(...v) : null;
}
