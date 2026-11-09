import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { UPSTREAM } from "../config/upstream.ts";
import { formatBytes } from "./terminal.ts";

export type RunOptions = {
  quiet?: boolean;
  cwd?: string;
  /** Aborting kills the child process. */
  signal?: AbortSignal;
  /** Called with every stdout/stderr chunk, progress-bar redraws included. */
  onOutput?: (chunk: string) => void;
};

/** Runs a command, streaming its output. Resolves with the combined output. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error(`${cmd} cancelled`));
      return;
    }

    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      opts.onOutput?.(text);
      if (!opts.quiet) process.stderr.write(text);
    };

    const onAbort = () => child.kill("SIGTERM");
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", reject);
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) reject(new Error(`${cmd} cancelled`));
      else if (code === 0) resolve(output);
      else reject(new Error(`${cmd} exited with code ${code}\n${lastLines(output)}`));
    });
  });
}

/** Command failures are long and mostly progress noise; keep the tail. */
function lastLines(output: string, count = 8): string {
  return output
    .split("\n")
    .map((l) => l.replace(/\r/g, "").trimEnd())
    .filter(Boolean)
    .slice(-count)
    .join("\n");
}

export type DownloadOptions = {
  label?: string;
  signal?: AbortSignal;
  /** Called a few times a second while bytes arrive. */
  onProgress?: (received: number, total: number) => void;
};

/** Downloads a URL to disk, reporting progress on a single line. */
export async function download(url: string, dest: string, opts: DownloadOptions = {}) {
  const label = opts.label ?? path.basename(dest);
  const res = await fetch(url, {
    headers: { "User-Agent": UPSTREAM.userAgent },
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  await fs.mkdir(path.dirname(dest), { recursive: true });

  let received = 0;
  let lastDrawn = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    received += chunk.length;
    const now = Date.now();
    if (now - lastDrawn > 120) {
      lastDrawn = now;
      opts.onProgress?.(received, total);
      if (process.stderr.isTTY) {
        const pct = total ? ` ${Math.round((received / total) * 100)}%` : "";
        process.stderr.write(`\r  ${label} ${formatBytes(received)}${pct}   `);
      }
    }
  }
  if (process.stderr.isTTY) process.stderr.write(`\r  ${label} ${formatBytes(received)}       \n`);
  opts.onProgress?.(received, total || received);
  await fs.writeFile(dest, Buffer.concat(chunks));
  return received;
}
