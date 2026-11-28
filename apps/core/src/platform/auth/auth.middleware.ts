import type { NextFunction, Request, Response } from 'express';
import { AuthService, type SessionUser } from './auth.service';

declare module 'express-serve-static-core' {
  interface Request {
    /** set by authMiddleware when the request is logged in */
    user?: SessionUser;
  }
}

/**
 * Open without a login: what the login and first-run screens need, and
 * core's health check. Everything else under /api/ and /svc/ needs one; the
 * web app's own files (/, /assets/, /ui/) are public so the login screen can
 * load. Socket.IO is checked in AuthIoAdapter.
 */
const PUBLIC_API = new Set(['/api/auth/state', '/api/auth/login', '/api/auth/setup', '/api/auth/logout', '/api/system/status']);
const PROTECTED = /^\/(api|svc)(\/|$)/;

/** Open to every account although their module is admin only: the status strip's values. */
const ANY_ACCOUNT = new Set(['/api/system/vitals']);

/**
 * Whether a path belongs to an admin-only screen: /api/<id> and below for
 * every module whose manifest says "admin": true (System, Logs, Settings,
 * Diagnostics, Users). ADMIN_IDS comes from the module registry.
 */
export function adminOnlyPath(path: string, adminIds: readonly string[]): boolean {
  if (PUBLIC_API.has(path) || ANY_ACCOUNT.has(path)) return false;
  return adminIds.some((id) => path === `/api/${id}` || path.startsWith(`/api/${id}/`));
}

/** ADMIN_IDS: asked per request, since the manifests load when core starts listening. */
/**
 * The path the rules compare: lower case, without repeated slashes. Routing
 * is case-sensitive too (main.ts), but the rules must never depend on how a
 * request spells a path: "/API/users" or "/api//users" are the same here.
 */
export function rulePath(path: string): string {
  return path.toLowerCase().replace(/\/{2,}/g, '/');
}

/**
 * Headers on every answer: no framing by other sites (clickjacking), no MIME
 * sniffing, no referrer to other sites; the login API is never cached.
 */
function securityHeaders(req: Request, res: Response): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/api/users')) res.setHeader('Cache-Control', 'no-store');
}

export function authMiddleware(auth: AuthService, adminIds: () => readonly string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    securityHeaders(req, res);
    const path = rulePath(req.path);
    const user = auth.resolve(req.headers.cookie, req.headers.authorization, req.socket.remoteAddress);
    if (user) req.user = user;
    if (user && user.role !== 'admin' && adminOnlyPath(path, adminIds())) {
      res.status(403).json({ statusCode: 403, message: 'Only an admin can open this.' });
      return;
    }
    if (user || !PROTECTED.test(path) || PUBLIC_API.has(path)) return next();
    // a page load of a module's raw file (e.g. an article opened in a new
    // tab): the web app, which shows the login
    if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html') && path.startsWith('/svc/')) {
      res.redirect(302, '/');
      return;
    }
    res.status(401).json({ statusCode: 401, message: auth.users.needsSetup ? 'Create the admin account first.' : 'Log in first.' });
  };
}
