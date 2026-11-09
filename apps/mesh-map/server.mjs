// server.mjs - the whole backend of mesh-map, no dependencies.
//
// Serves, read-only, the map data the Maps module has downloaded: region
// archives (*.pmtiles, read by the browser with HTTP range requests), fonts
// and sprites. It never writes anything, and it never talks to Maps or Mesh.
// The page is the web app's /mesh-map screen (apps/web); core's mesh-map
// domain combines /api/config with the mesh nodes (/api/mesh-map/overview),
// and the browser loads the files below through core's passthrough
// (/svc/mesh-map/, prefix stripped).
//
//   GET /api/config               { regions } (re-read each call)
//   GET /pmtiles/<region>.pmtiles  range requests into a region archive
//   GET /fonts/<stack>/<range>.pbf glyphs (comma-separated fallback stacks)
//   GET /sprites/<file>            sprite sheets
//   GET /healthz                   liveness for the container healthcheck

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8086);
const HOST = process.env.HOST ?? "127.0.0.1";
const MAPS_DATA = path.resolve(process.env.MAPS_DATA ?? path.join(HERE, "../maps/data"));
const MAPS_ASSETS = path.resolve(process.env.MAPS_ASSETS ?? path.join(HERE, "../maps/assets"));

const REGION_NAME = /^[a-z0-9][a-z0-9-]*$/;
const GLYPH_RANGE = /^\d+-\d+\.pbf$/;
const IMMUTABLE = "public, max-age=604800, immutable";
const TYPES = {
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".pbf": "application/x-protobuf",
  ".pmtiles": "application/octet-stream",
  ".woff2": "font/woff2",
};

/** Resolve inside `root` only; undefined when the path escapes it. */
function safeJoin(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  return rel.startsWith("..") || path.isAbsolute(rel) ? undefined : target;
}

async function statFile(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() ? stat : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Regions the Maps module lists in regions.json whose archive is on disk. Re-read
 * on every call, so a region downloaded in Maps shows up on reload.
 */
async function availableRegions() {
  let regions;
  try {
    regions = JSON.parse(await fs.readFile(path.join(MAPS_DATA, "regions.json"), "utf8")).regions ?? [];
  } catch {
    return [];
  }
  const out = [];
  for (const r of regions) {
    if (!REGION_NAME.test(r?.name ?? "")) continue;
    if (!(await statFile(path.join(MAPS_DATA, "regions", `${r.name}.pmtiles`)))) continue;
    out.push({
      name: r.name,
      label: r.label,
      bbox: r.bbox,
      minzoom: r.minzoom,
      maxzoom: r.maxzoom,
    });
  }
  return out;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

function sendJson(res, value) {
  send(res, 200, JSON.stringify(value), { "Content-Type": "application/json", "Cache-Control": "no-store" });
}

/** Stream a file, honouring a single `Range: bytes=...` (what pmtiles.js sends). */
function sendFile(req, res, file, stat, cache) {
  const type = TYPES[path.extname(file)] ?? "application/octet-stream";
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", ETag: etag, "Cache-Control": cache };

  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    if (req.method === "HEAD") return res.end();
    return createReadStream(file).pipe(res);
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = m && m[1] !== "" ? Number(m[1]) : NaN;
  let end = m && m[2] !== "" ? Number(m[2]) : NaN;
  if (m && m[1] === "" && m[2] !== "") {
    start = Math.max(stat.size - end, 0); // suffix range: last N bytes
    end = stat.size - 1;
  } else if (Number.isNaN(end) || end >= stat.size) {
    end = stat.size - 1;
  }
  if (!m || Number.isNaN(start) || start > end || start >= stat.size) {
    return send(res, 416, "range not satisfiable", { "Content-Range": `bytes */${stat.size}` });
  }
  res.writeHead(206, {
    ...headers,
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Content-Length": end - start + 1,
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file, { start, end }).pipe(res);
}

async function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    return send(res, 400, "bad url");
  }

  if (pathname === "/healthz") return send(res, 200, "ok");
  if (pathname === "/api/config") return sendJson(res, { regions: await availableRegions() });

  let m = /^\/pmtiles\/([^/]+)\.pmtiles$/.exec(pathname);
  if (m) {
    if (!REGION_NAME.test(m[1])) return send(res, 404, "unknown region");
    const file = path.join(MAPS_DATA, "regions", `${m[1]}.pmtiles`);
    const stat = await statFile(file);
    // archives can be rebuilt in place by the Maps module, so revalidate (ETag) rather than cache forever
    return stat ? sendFile(req, res, file, stat, "no-cache") : send(res, 404, "unknown region");
  }

  m = /^\/fonts\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (m) {
    if (!GLYPH_RANGE.test(m[2])) return send(res, 404, "bad glyph range");
    for (const stack of m[1].split(",")) {
      const file = safeJoin(path.join(MAPS_ASSETS, "fonts"), stack.trim(), m[2]);
      const stat = file && (await statFile(file));
      if (stat) return sendFile(req, res, file, stat, IMMUTABLE);
    }
    return send(res, 404, "glyph range not found");
  }

  if (pathname.startsWith("/sprites/")) {
    const file = safeJoin(path.join(MAPS_ASSETS, "sprites"), pathname.slice("/sprites/".length));
    const stat = file && (await statFile(file));
    return stat ? sendFile(req, res, file, stat, IMMUTABLE) : send(res, 404, "sprite not found");
  }

  return send(res, 404, "not found");
}

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, "internal error");
      else res.destroy();
    });
  })
  .listen(PORT, HOST, () => {
    console.log(`mesh-map on http://${HOST}:${PORT}`);
    console.log(`  map data:   ${MAPS_DATA} (read-only)`);
    console.log(`  map assets: ${MAPS_ASSETS} (read-only)`);
  });
