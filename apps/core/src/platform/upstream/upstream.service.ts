import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModulesService } from '../modules/modules.service';
import { Module } from '../modules/registry';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface UpstreamRequest {
  /** an array repeats the key (e.g. books.id=a&books.id=b) */
  query?: Record<string, string | number | boolean | readonly string[] | undefined | null>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  timeoutMs?: number;
  /** abort from outside (e.g. the browser went away) */
  signal?: AbortSignal;
}

/**
 * How a domain talks to its module's container: plain HTTP on loopback
 * (http://MODULES_BIND_ADDRESS:<port>, from the manifest). Failures become
 * the HTTP errors the web app expects:
 *   - not installed           -> 404
 *   - not reachable (stopped) -> 503 "<Label> is not running"
 *   - upstream 4xx/5xx        -> same status, upstream message
 */
export class UpstreamClient {
  constructor(readonly module: Module) {}

  /** Absolute URL on the module. Paths are relative to its root (kiwix: its URL root is added). */
  url(path: string, query?: UpstreamRequest['query']): URL {
    const base = this.module.upstream!;
    const prefix = this.module.stripPrefix === false ? this.module.svcPath.slice(0, -1) : '';
    const url = new URL(prefix + path, base);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (Array.isArray(v)) for (const item of v) url.searchParams.append(k, item);
      else if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    return url;
  }

  /**
   * Headers a module needs to build absolute URLs for the browser (e.g. map
   * styles): the public host and the passthrough prefix.
   */
  forwarded(host: string | undefined): Record<string, string> {
    return {
      'x-forwarded-host': host ?? '',
      'x-forwarded-proto': 'http',
      'x-forwarded-prefix': this.module.svcPath.slice(0, -1),
    };
  }

  /** Raw fetch; errors are mapped, the response is returned as is (2xx only). */
  async fetch(method: string, path: string, opts: UpstreamRequest = {}): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json' };
    for (const [k, v] of Object.entries(opts.headers ?? {})) if (v !== undefined) headers[k.toLowerCase()] = v;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

    let res: Response;
    try {
      res = await fetch(this.url(path, opts.query), { method, headers, body, signal });
    } catch (err) {
      throw this.unreachable(err);
    }
    if (!res.ok) throw await this.httpError(res);
    return res;
  }

  /** JSON request; 204 resolves to undefined. */
  async request<T>(method: string, path: string, opts: UpstreamRequest = {}): Promise<T> {
    const res = await this.fetch(method, path, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, opts?: UpstreamRequest) {
    return this.request<T>('GET', path, opts);
  }
  post<T>(path: string, body?: unknown, opts?: UpstreamRequest) {
    return this.request<T>('POST', path, { ...opts, body });
  }
  patch<T>(path: string, body?: unknown, opts?: UpstreamRequest) {
    return this.request<T>('PATCH', path, { ...opts, body });
  }
  delete<T>(path: string, opts?: UpstreamRequest) {
    return this.request<T>('DELETE', path, opts);
  }

  /** Text request (HTML/XML, e.g. kiwix's OPDS catalogue). */
  async text(path: string, opts: UpstreamRequest = {}): Promise<string> {
    const res = await this.fetch('GET', path, { ...opts, headers: { accept: '*/*', ...opts.headers } });
    return res.text();
  }

  /** WebSocket URL on the module (ws://...). */
  wsUrl(path: string): string {
    const url = this.url(path);
    url.protocol = 'ws:';
    return url.toString();
  }

  private unreachable(err: unknown): HttpException {
    const e = err as Error & { cause?: { code?: string } };
    if (e.name === 'TimeoutError') {
      return new HttpException(`${this.module.label} did not answer in time.`, HttpStatus.GATEWAY_TIMEOUT);
    }
    if (e.name === 'AbortError') return new HttpException('Request cancelled.', 499);
    return moduleDown(this.module);
  }

  private async httpError(res: Response): Promise<HttpException> {
    let message = `${this.module.label} answered HTTP ${res.status}`;
    const raw = await res.text().catch(() => '');
    try {
      const body = JSON.parse(raw) as { message?: unknown; detail?: unknown; error?: unknown };
      const m = body.message ?? body.detail ?? body.error;
      if (typeof m === 'string') message = m;
      else if (Array.isArray(m)) message = m.map(String).join(', ');
    } catch {
      // not JSON (kiwix answers XML/HTML): its text, without the markup
      const plain = errorText(raw);
      if (plain) message = `${this.module.label}: ${plain}`;
    }
    const ex = new HttpException({ statusCode: res.status, message }, res.status);
    const retry = res.headers.get('retry-after');
    if (retry) (ex as HttpException & { retryAfter?: string }).retryAfter = retry;
    return ex;
  }
}

/**
 * The readable part of an HTML/XML error page, e.g. kiwix's "Invalid request
 * ... is not a valid request. No such book: x" -> "No such book: x".
 */
export function errorText(body: string): string {
  const plain = body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  const reason = /is not a valid request\.\s*(.+)$/i.exec(plain)?.[1] ?? plain;
  return reason.slice(0, 300);
}

/** 503 for a module whose container is not running. */
export function moduleDown(m: Module): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    message: `${m.label} is not running. Start it on the home page.`,
    module: m.id,
  });
}

/** Hands out one UpstreamClient per module id. */
@Injectable()
export class UpstreamService {
  private readonly clients = new Map<string, UpstreamClient>();

  constructor(private readonly modules: ModulesService) {}

  /** Client for an installed module; 404 when it is not installed. */
  client(id: string): UpstreamClient {
    const m = this.modules.get(id);
    if (!m || !m.upstream) throw new NotFoundException(`Module "${id}" has no upstream.`);
    if (!this.modules.isInstalled(id)) {
      throw new NotFoundException({ statusCode: 404, message: `${m.label} is not installed: run ./install.sh.`, module: id });
    }
    let c = this.clients.get(id);
    if (!c) {
      c = new UpstreamClient(m);
      this.clients.set(id, c);
    }
    return c;
  }
}
