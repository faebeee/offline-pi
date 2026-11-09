import type { NextFunction, Request, Response } from "express";
import { PORT } from "../config/server.ts";

/**
 * Static allowlist: the viewer served by this process, and the Vite dev server
 * that proxies to it. `ALLOWED_ORIGINS` adds more for unusual setups.
 */
function staticOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // `localhost` and `127.0.0.1` are the same server but different origins, and
  // the viewer may be opened under either one.
  const hosts = ["localhost", "127.0.0.1"];
  const ports = new Set([String(PORT), "5173"]);
  return [...hosts.flatMap((h) => [...ports].map((p) => `http://${h}:${p}`)), ...extra];
}

/**
 * True when the request comes from the page this server itself served — which
 * covers deployments under any hostname, container or reverse proxy.
 */
function isSelfOrigin(req: Request, origin: string): boolean {
  const host = req.headers.host;
  return !!host && (origin === `http://${host}` || origin === `https://${host}`);
}

export function isAllowedOrigin(req: Request, origin: string): boolean {
  return isSelfOrigin(req, origin) || staticOrigins().includes(origin);
}

/** Routes that stay readable by any origin: QGIS, the pmtiles CLI, scripts. */
const PUBLIC_PREFIXES = ["/tiles", "/pmtiles", "/fonts", "/sprites"];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`));
}

/**
 * Two CORS policies in one: map data is world-readable, `/api` is not. The API
 * can start multi-gigabyte downloads and delete regions, so it only answers
 * origins we know.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (isPublic(req.path)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, ETag",
    );
  } else if (origin && isAllowedOrigin(req, origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
    return;
  }

  next();
}
