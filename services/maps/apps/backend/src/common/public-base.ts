import type { Request } from "express";

/**
 * The absolute base URL this request was reached through, as seen by the
 * browser: scheme + host + mount prefix. Styles embed tile/font/sprite URLs
 * built from this, so the same build works standalone (plain `http://host:port`)
 * and proxied by core under `/maps/` (gateway.ts sends `X-Forwarded-*`).
 */
export function publicBase(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const prefix = req.headers["x-forwarded-prefix"] ?? "";

  return `${proto}://${host}${prefix}`;
}
