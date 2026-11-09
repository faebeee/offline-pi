import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Logger } from '@nestjs/common';

/** Paths that are never the web app (API, sockets, design system, passthrough). */
const NOT_WEB = /^\/(api|svc|socket\.io|ui)(\/|$)/;

function webDir(): string | null {
  if (process.env.WEB_DIR) return process.env.WEB_DIR;
  try {
    return join(dirname(require.resolve('@offline-pi/web/package.json')), 'dist');
  } catch {
    return null;
  }
}

/**
 * Serves the web app (apps/web, @offline-pi/web) at /: its built files, and
 * index.html for every other page load (client-side routes such as /maps/
 * or /mesh/ch:0), so deep links and reloads work.
 */
export function serveWeb(app: NestExpressApplication) {
  const dir = webDir();
  const index = dir && join(dir, 'index.html');
  if (!dir || !index || !existsSync(index)) {
    Logger.warn(`web app not built (${dir ?? '@offline-pi/web not found'}): run npm run build`, 'web');
    return;
  }
  app.useStaticAssets(dir, { index: false, redirect: false, maxAge: '1h', immutable: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || NOT_WEB.test(req.path)) return next();
    if (!(req.headers.accept ?? '').includes('text/html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
