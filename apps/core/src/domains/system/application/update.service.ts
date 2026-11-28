import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Subject } from 'rxjs';
import { JsonFile } from '../../../platform/storage/json-file';
import { PACKAGE_JSON } from '../../info/infrastructure/docs.reader';
import { UpdateStatus } from '../domain/update.dto';
import { InternetService } from './internet.service';
import { compareVersions, parseVersion } from './semver';

/**
 * GitHub's newest release of outpost (drafts and pre-releases are skipped
 * by /releases/latest). CORE_UPDATE_CHECK_URL points elsewhere, for a fork
 * or a mirror that answers the same JSON.
 */
const DEFAULT_URL = 'https://api.github.com/repos/faebeee/offline-pi/releases/latest';
const URL_ = (process.env.CORE_UPDATE_CHECK_URL ?? '').trim() || DEFAULT_URL;
const ENABLED = !/^(false|0|no|off)$/i.test((process.env.CORE_UPDATE_CHECK ?? 'true').trim());
const INTERVAL_MS = Math.max(1, Number(process.env.CORE_UPDATE_CHECK_HOURS) || 24) * 3_600_000;

/** the first check, after core settled (and the internet check answered) */
const FIRST_CHECK_MS = 2 * 60_000;
/** how often it looks whether a check is due (also: whether the Pi came online) */
const TICK_MS = 5 * 60_000;
/** a failed attempt is retried after this long, not at every tick */
const RETRY_MS = 60 * 60_000;
/** "Check now" at most this often */
const MANUAL_MIN_MS = 60_000;
const TIMEOUT_MS = 10_000;
const MAX_NOTES = 20_000;

type Stored = {
  latest: string | null;
  releasedAt: number | null;
  notes: string | null;
  url: string | null;
  etag: string | null;
  checkedAt: number | null;
  attemptedAt: number | null;
  error: string | null;
};

const EMPTY: Stored = { latest: null, releasedAt: null, notes: null, url: null, etag: null, checkedAt: null, attemptedAt: null, error: null };

type Release = { tag_name?: unknown; published_at?: unknown; body?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };

/**
 * The update check: once every CORE_UPDATE_CHECK_HOURS (24), and only while
 * InternetService says the Pi is online, asks GitHub for the newest
 * release and keeps the answer in CORE_DATA_DIR/update.json, so it
 * survives restarts and long offline periods. The request carries a
 * generic User-Agent and the last ETag (a 304 doesn't count against
 * GitHub's limit of 60 requests an hour) and nothing about this Pi.
 * CORE_UPDATE_CHECK=false switches it off: no request at all.
 */
@Injectable()
export class UpdateService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(UpdateService.name);
  private readonly file = JsonFile.inDataDir<Partial<Stored>>('update.json', () => ({}));
  private data: Stored = { ...EMPTY };
  private installed: string | null = null;
  private running: Promise<void> | null = null;
  private lastManual = 0;
  private first?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  /** every new status (Socket.IO /system "update") */
  readonly updates$ = new Subject<UpdateStatus>();

  constructor(private readonly internet: InternetService) {}

  async onModuleInit(): Promise<void> {
    this.data = { ...EMPTY, ...(await this.file.load()) };
    this.installed = await readInstalled();
    if (!ENABLED) {
      this.log.log('Update check switched off (CORE_UPDATE_CHECK=false)');
      return;
    }
    this.first = setTimeout(() => {
      void this.tick();
      this.timer = setInterval(() => void this.tick(), TICK_MS);
    }, FIRST_CHECK_MS);
  }

  onModuleDestroy(): void {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  status(): UpdateStatus {
    const d = this.data;
    const available = !!(d.latest && this.installed && compareVersions(d.latest, this.installed) > 0);
    return {
      installed: this.installed,
      latest: d.latest,
      available,
      releasedAt: d.releasedAt,
      notes: d.notes,
      url: d.url,
      actionNeeded: !!d.notes && /^\s*(?:[-*]\s*)?(?:\*\*)?Action needed:/im.test(d.notes),
      checkedAt: d.checkedAt,
      attemptedAt: d.attemptedAt,
      error: d.error,
      enabled: ENABLED,
      checking: this.running !== null,
    };
  }

  /** "Check now" (admins): runs even when the internet check says offline. */
  async checkNow(): Promise<UpdateStatus> {
    if (!ENABLED) {
      throw new HttpException('The update check is switched off (CORE_UPDATE_CHECK=false).', HttpStatus.CONFLICT);
    }
    const now = Date.now();
    if (now - this.lastManual < MANUAL_MIN_MS) {
      throw new HttpException('Checked a moment ago. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    // counted when it starts
    this.lastManual = now;
    await this.check();
    return this.status();
  }

  private async tick(): Promise<void> {
    if (this.internet.state.state !== 'online') return;
    const now = Date.now();
    const d = this.data;
    if (d.checkedAt && now - d.checkedAt < INTERVAL_MS) return;
    if (d.error && d.attemptedAt && now - d.attemptedAt < RETRY_MS) return;
    await this.check();
  }

  /** One request at a time; a second caller waits for the running one. */
  private check(): Promise<void> {
    if (!this.running) {
      this.running = this.request().finally(() => {
        this.running = null;
        this.updates$.next(this.status());
      });
      this.updates$.next(this.status());
    }
    return this.running;
  }

  private async request(): Promise<void> {
    const next: Stored = { ...this.data, attemptedAt: Date.now() };
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'outpost-update-check',
      };
      if (next.etag) headers['If-None-Match'] = next.etag;
      const res = await fetch(URL_, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 304) {
        // unchanged since the last answer
      } else if (res.status === 404) {
        // no release published yet
        Object.assign(next, { latest: null, releasedAt: null, notes: null, url: null, etag: null });
      } else if (res.ok) {
        const rel = (await res.json()) as Release;
        const tag = typeof rel.tag_name === 'string' ? rel.tag_name : '';
        if (rel.draft === true || rel.prerelease === true || !parseVersion(tag)) {
          throw new Error(`unexpected release "${tag}"`);
        }
        const published = typeof rel.published_at === 'string' ? Date.parse(rel.published_at) : NaN;
        Object.assign(next, {
          latest: tag.replace(/^v/, ''),
          releasedAt: Number.isNaN(published) ? null : published,
          notes: typeof rel.body === 'string' ? rel.body.slice(0, MAX_NOTES) : null,
          url: typeof rel.html_url === 'string' && rel.html_url.startsWith('https://') ? rel.html_url : null,
          etag: res.headers.get('etag'),
        });
      } else {
        throw new Error(res.status === 403 || res.status === 429 ? 'GitHub refused (rate limit), try later' : `GitHub answered ${res.status}`);
      }
      next.checkedAt = Date.now();
      next.error = null;
      if (next.latest !== this.data.latest && next.latest) {
        const newer = this.installed && compareVersions(next.latest, this.installed) > 0;
        this.log.log(newer ? `outpost ${next.latest} is available (installed: ${this.installed}); run ./update.sh on the Pi` : `Newest release: ${next.latest}`);
      }
    } catch (err) {
      const e = err as Error;
      next.error = e.name === 'TimeoutError' ? 'GitHub did not answer in time' : e.message === 'fetch failed' ? 'Could not reach GitHub (no internet?)' : e.message;
      this.log.warn(`Update check failed: ${next.error}`);
    }
    this.data = next;
    await this.file.save(next);
  }
}

async function readInstalled(): Promise<string | null> {
  try {
    const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}
