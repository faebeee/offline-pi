import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InternetInfo } from '../domain/snapshot.dto';

/**
 * Servers asked to tell whether the Pi gets out to the internet: the ones
 * outpost downloads from anyway (map builds, library), so the check talks to
 * nobody new. CORE_INTERNET_CHECK_URLS overrides them; empty switches it off.
 */
const DEFAULT_URLS = 'https://build.protomaps.com/,https://download.kiwix.org/';

const URLS = (process.env.CORE_INTERNET_CHECK_URLS ?? DEFAULT_URLS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const INTERVAL_MS = Math.max(10_000, Number(process.env.CORE_INTERNET_CHECK_INTERVAL_MS) || 60_000);
const TIMEOUT_MS = 5_000;

/**
 * Checks outgoing internet access every CORE_INTERNET_CHECK_INTERVAL_MS
 * (1 min): a HEAD request to each URL in turn until one answers. Any HTTP
 * answer counts (even 403/404): the request got out and back. A captive
 * portal answers too, but over HTTPS its certificate fails, so it counts as
 * offline.
 */
@Injectable()
export class InternetService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(InternetService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  state: InternetInfo = {
    state: URLS.length ? 'checking' : 'disabled',
    checkedAt: null,
    latencyMs: null,
    target: null,
  };

  onModuleInit() {
    if (!URLS.length) {
      this.log.log('Internet check switched off (CORE_INTERNET_CHECK_URLS is empty)');
      return;
    }
    void this.check();
    this.timer = setInterval(() => void this.check(), INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async check() {
    if (this.running) return;
    this.running = true;
    try {
      const before = this.state.state;
      let next: InternetInfo = { state: 'offline', checkedAt: Date.now(), latencyMs: null, target: null };
      for (const url of URLS) {
        const started = Date.now();
        try {
          await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
          next = { state: 'online', checkedAt: Date.now(), latencyMs: Date.now() - started, target: new URL(url).host };
          break;
        } catch {
          // DNS failure, no route, timeout, TLS error: try the next one
        }
      }
      this.state = next;
      if (before !== next.state && before !== 'checking') this.log.log(`Internet ${next.state}`);
    } finally {
      this.running = false;
    }
  }
}
