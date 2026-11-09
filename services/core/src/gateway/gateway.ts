import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { IncomingMessage, request, Server } from 'node:http';
import { connect, Socket } from 'node:net';
import { Duplex } from 'node:stream';
import { ModulesService } from '../modules/modules.service';
import { Module } from '../modules/registry';

const logger = new Logger('Gateway');

// hop-by-hop headers are not forwarded (RFC 9110 7.6.1)
const HOP = ['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade'];

/**
 * Reverse proxy from core's port to the modules on loopback: /maps/x goes to
 * http://127.0.0.1:MAPS_PORT/x (or /maps/x when the module wants the prefix,
 * stripPrefix: false). Streams both ways, so SSE, range requests (pmtiles)
 * and large downloads pass through unbuffered; WebSocket upgrades are piped
 * by attachUpgrade(). The browser keeps one origin, so the modules need no
 * CORS. Modules learn their public prefix from X-Forwarded-Prefix.
 */
export function gatewayMiddleware(modules: ModulesService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const m = modules.forPath(req.path);
    if (!m) {
      // a module that isn't installed: the home page says how to add it
      const other = modules.modules.find((x) => x.optional && (req.path + '/').startsWith(x.path));
      if (other && req.method === 'GET') return res.redirect(302, `/?module=${encodeURIComponent(other.id)}`);
      return next();
    }
    // /maps -> /maps/ so relative URLs in the module resolve under its path
    if (req.path === m.path.slice(0, -1)) {
      const q = req.originalUrl.slice(req.path.length);
      return res.redirect(301, m.path + q);
    }
    proxyHttp(m, req, res);
  };
}

function target(m: Module, url: string): { host: string; port: number; path: string } {
  const up = new URL(m.upstream!);
  const prefix = m.path.slice(0, -1);
  const path = m.stripPrefix !== false ? url.slice(prefix.length) || '/' : url;
  return { host: up.hostname, port: Number(up.port), path };
}

function forwardedHeaders(m: Module, req: IncomingMessage) {
  const headers: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined && !HOP.includes(k)) headers[k] = v;
  }
  const remote = req.socket.remoteAddress ?? '';
  headers['x-forwarded-for'] = req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${remote}` : remote;
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-prefix'] = m.path.slice(0, -1);
  return headers;
}

function proxyHttp(m: Module, req: Request, res: Response) {
  const t = target(m, req.originalUrl);
  const upstream = request(
    { host: t.host, port: t.port, path: t.path, method: req.method, headers: forwardedHeaders(m, req) },
    (up) => {
      const headers = { ...up.headers };
      for (const h of HOP) delete headers[h];
      // a redirect to an absolute path on the module stays under its prefix
      const loc = headers.location;
      if (m.stripPrefix !== false && typeof loc === 'string' && loc.startsWith('/') && !loc.startsWith('//')) {
        headers.location = m.path.slice(0, -1) + loc;
      }
      res.writeHead(up.statusCode ?? 502, up.statusMessage, headers);
      // SSE: push every chunk right away
      if (String(up.headers['content-type']).startsWith('text/event-stream')) res.flushHeaders();
      up.pipe(res);
    },
  );
  upstream.on('error', (err: NodeJS.ErrnoException) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const down = err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET';
    if (!down) logger.warn(`${m.id}: ${err.message}`);
    unavailable(m, req, res);
  });
  // client went away (e.g. closed an SSE stream): drop the upstream request
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

/** Module not reachable (stopped): home page for browsers, 503 JSON otherwise. */
function unavailable(m: Module, req: Request, res: Response) {
  // only real page loads (browsers send text/html explicitly), not fetch()/curl
  if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
    // the home page shows the module as stopped, with its START button
    res.redirect(302, `/?module=${encodeURIComponent(m.id)}`);
    return;
  }
  res.status(503).setHeader('Retry-After', '5');
  res.json({ statusCode: 503, message: `${m.label} is not running. Start it on the dashboard.` });
}

/** Pipe WebSocket upgrades under a module path (e.g. mesh /api/live). */
export function attachUpgrade(server: Server, modules: ModulesService) {
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = (req.url ?? '/').split('?')[0];
    const m = modules.forPath(path);
    if (!m) return; // socket.io (core) handles its own path
    const t = target(m, req.url ?? '/');
    const up: Socket = connect(t.port, t.host, () => {
      const headers = forwardedHeaders(m, req);
      headers.connection = 'Upgrade';
      headers.upgrade = req.headers.upgrade ?? 'websocket';
      let head1 = `${req.method} ${t.path} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(headers)) {
        for (const val of Array.isArray(v) ? v : [v]) head1 += `${k}: ${val}\r\n`;
      }
      up.write(head1 + '\r\n');
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
    });
    socket.on('error', () => up.destroy());
    socket.on('close', () => up.destroy());
    up.on('close', () => socket.destroy());
  });
}
