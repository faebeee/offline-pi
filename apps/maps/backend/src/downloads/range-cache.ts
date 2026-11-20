import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { UPSTREAM } from "../config/upstream.ts";

/**
 * A caching HTTP proxy in front of the planet build, which is what makes a
 * region download resumable.
 *
 * go-pmtiles can't resume an extract: after any error it starts over. But
 * for the same build, boundary and zoom range it asks for exactly the same
 * byte ranges every time. So `pmtiles extract` reads the build through this
 * proxy (on 127.0.0.1, a random port), and every range it fetches is kept
 * on disk as `<dir>/<start>-<end>`. A range that is cut off is kept as
 * `<start>-<end>.part` and continued from its last byte. Running the extract
 * again then replays the stored ranges from disk and only fetches what is
 * still missing. The proxy also retries a dropped connection itself, so
 * go-pmtiles rarely sees one.
 */

export type RangeCacheOptions = {
  /** the planet build, e.g. https://build.protomaps.com/20251101.pmtiles */
  upstream: string;
  /** where the ranges are stored */
  dir: string;
  /** the build's ETag from an earlier run: a changed build fails the download */
  etag?: string;
  signal: AbortSignal;
  /** bytes newly stored (fetched from upstream) */
  onBytes?: (bytes: number) => void;
  /** the build's ETag, seen on the first upstream response */
  onEtag?: (etag: string) => void;
  onLog?: (line: string) => void;
};

export type RangeCache = {
  /** the URL to hand to go-pmtiles instead of the upstream one */
  url: string;
  /** the last error that made the proxy give up on a range, if any */
  failure(): string | undefined;
  close(): Promise<void>;
};

/** Consecutive failed attempts (without a byte of progress) before a range gives up. */
const MAX_ATTEMPTS = 8;
/** A connection that delivers nothing for this long is dropped and retried. */
const STALL_MS = 60_000;
/**
 * On resume, the tail of a `.part` file is dropped and fetched again: after
 * a power cut, a non-journaling drive (exFAT) can report a size whose last
 * bytes never reached the disk.
 */
const DISTRUST_TAIL = 1 << 20;

/** The build changed upstream: stored ranges no longer fit it. */
class BuildChangedError extends Error {}

/** Bytes stored in a cache directory (complete and partial ranges). */
export async function cachedBytes(dir: string): Promise<number> {
  let total = 0;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!/^\d+-\d+(\.part)?$/.test(name)) continue;
    try {
      total += (await fs.stat(path.join(dir, name))).size;
    } catch {
      // removed meanwhile
    }
  }
  return total;
}

export async function startRangeCache(options: RangeCacheOptions): Promise<RangeCache> {
  await fs.mkdir(options.dir, { recursive: true });
  let etag = options.etag;
  let failure: string | undefined;

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err: Error) => {
      if (!options.signal.aborted && !(err instanceof ClientGone)) {
        failure = err.message;
        options.onLog?.(`map server: ${err.message}`);
      }
      if (!res.headersSent) {
        res.writeHead(err instanceof BuildChangedError ? 412 : 502, { "content-type": "text/plain" });
        res.end(err.message);
      } else {
        // the body is incomplete: go-pmtiles must see an error, not a short read
        res.destroy(err);
      }
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
    if (req.method !== "GET" || !range) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("only GET with a byte range");
      return;
    }
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (end < start) {
      res.writeHead(416);
      res.end();
      return;
    }
    const length = end - start + 1;
    const file = path.join(options.dir, `${start}-${end}`);
    const part = `${file}.part`;

    // stopped when go-pmtiles hangs up (it was killed, or gave up on us)
    const local = new AbortController();
    const stop = () => local.abort();
    options.signal.addEventListener("abort", stop, { once: true });
    res.on("close", stop);
    try {
      const done = await sizeOf(file);
      if (done === length) {
        res.writeHead(206, headers(start, end, length));
        await pipeline(createReadStream(file), res, { signal: local.signal });
        return;
      }

      // a .part is continued, minus the tail it can't vouch for
      let have = (await sizeOf(part)) ?? 0;
      if (have > length) have = 0;
      have = Math.max(0, have - DISTRUST_TAIL);
      const out = await fs.open(part, "a+");
      try {
        await out.truncate(have);
        // the head waits for the build's ETag and for upstream to answer at
        // all, so a failure can still be a proper status rather than a cut body
        const head = async () => {
          if (res.headersSent) return;
          res.writeHead(206, headers(start, end, length));
          if (have > 0) {
            await pipeline(createReadStream(part, { start: 0, end: have - 1 }), res, {
              signal: local.signal,
              end: false,
            });
          }
        };
        await fetchInto(out, start + have, end, res, local.signal, head);
        await out.sync();
      } finally {
        await out.close();
      }
      await fs.rename(part, file);
      res.end();
    } finally {
      options.signal.removeEventListener("abort", stop);
      res.off("close", stop);
    }
  }

  /**
   * Fetches [from, end] from upstream, appending to `out` and writing to
   * `res`, retrying dropped connections from the byte it got to.
   */
  async function fetchInto(
    out: fs.FileHandle,
    from: number,
    end: number,
    res: http.ServerResponse,
    signal: AbortSignal,
    head: () => Promise<void>,
  ): Promise<void> {
    let offset = from;
    let attempt = 0;
    while (offset <= end) {
      if (signal.aborted) throw new ClientGone();
      const attemptCtl = new AbortController();
      const relay = () => attemptCtl.abort();
      signal.addEventListener("abort", relay, { once: true });
      let stall = setTimeout(relay, STALL_MS);
      const before = offset;
      try {
        const reply = await fetch(options.upstream, {
          headers: {
            range: `bytes=${offset}-${end}`,
            "user-agent": UPSTREAM.userAgent,
            ...(etag ? { "if-match": etag } : {}),
          },
          signal: attemptCtl.signal,
        });
        if (reply.status === 412) {
          throw new BuildChangedError(
            "the planet build changed on the map server; cancel this download and start it again",
          );
        }
        if (reply.status !== 206 || !reply.body) {
          const err = new Error(`map server answered ${reply.status} ${reply.statusText}`);
          if (reply.status >= 500 || reply.status === 429) throw Object.assign(err, { transient: true });
          throw err;
        }
        const seen = reply.headers.get("etag");
        if (seen && !etag) {
          etag = seen;
          options.onEtag?.(seen);
        }
        await head();
        for await (const chunk of reply.body as unknown as AsyncIterable<Uint8Array>) {
          clearTimeout(stall);
          stall = setTimeout(relay, STALL_MS);
          const bytes = chunk.subarray(0, Math.max(0, end - offset + 1));
          await out.write(bytes);
          offset += bytes.length;
          options.onBytes?.(bytes.length);
          if (!res.write(bytes)) await drained(res, signal);
          if (offset > end) break;
        }
        if (offset <= end) throw Object.assign(new Error("the map server closed the connection early"), { transient: true });
      } catch (err) {
        if (signal.aborted) throw new ClientGone();
        if (err instanceof BuildChangedError) throw err;
        const transient =
          (err as { transient?: boolean }).transient ||
          attemptCtl.signal.aborted || // stalled
          err instanceof TypeError; // fetch failed: DNS, reset, TLS, ...
        if (!transient) throw err;
        attempt = offset > before ? 1 : attempt + 1;
        if (attempt >= MAX_ATTEMPTS) {
          throw new Error(`no connection to the map server: ${describe(err)}`);
        }
        const wait = Math.min(30, 2 ** attempt);
        options.onLog?.(`connection to the map server dropped (${describe(err)}), retrying in ${wait} s`);
        await sleep(wait * 1000, signal);
      } finally {
        clearTimeout(stall);
        signal.removeEventListener("abort", relay);
      }
    }
  }

  function headers(start: number, end: number, length: number): http.OutgoingHttpHeaders {
    return {
      "content-type": "application/octet-stream",
      "content-length": String(length),
      "content-range": `bytes ${start}-${end}/*`,
      ...(etag ? { etag } : {}),
    };
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const fileName = path.basename(new URL(options.upstream).pathname);

  return {
    url: `http://127.0.0.1:${port}/${fileName}`,
    failure: () => failure,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

/** go-pmtiles hung up: nothing to report, the range stays for next time. */
class ClientGone extends Error {
  constructor() {
    super("client gone");
  }
}

async function sizeOf(file: string): Promise<number | undefined> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return undefined;
  }
}

function drained(res: http.ServerResponse, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", gone);
      resolve();
    };
    const gone = () => {
      res.off("drain", done);
      reject(new ClientGone());
    };
    if (signal.aborted) return reject(new ClientGone());
    res.once("drain", done);
    res.once("close", gone);
  });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ClientGone());
    const stop = () => {
      clearTimeout(timer);
      reject(new ClientGone());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal.addEventListener("abort", stop, { once: true });
  });
}

function describe(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  return e.cause?.code ?? e.cause?.message ?? e.message ?? String(err);
}
