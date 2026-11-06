import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { PMTiles, type Header } from "pmtiles";
import { PATHS } from "../config/paths.ts";
import { UPSTREAM } from "../config/upstream.ts";
import { exists } from "../common/files.ts";
import { download, run } from "../common/net.ts";
import { c, log, type Report } from "../common/terminal.ts";

export type ExtractOptions = {
  source: string;
  outFile: string;
  regionFile: string;
  minzoom: number;
  maxzoom: number;
};

export type ExtractEstimate = { archiveBytes: number; transferBytes: number };

export type ExtractProgress = { bytes: number; total: number; percent: number };

export type ExtractHooks = {
  signal?: AbortSignal;
  /** expected archive size, from `estimate()` */
  totalBytes?: number;
  onProgress?: (progress: ExtractProgress) => void;
  onLog?: (chunk: string) => void;
};

/** Maps the current platform onto a go-pmtiles release asset name. */
function releaseAsset(version: string): string {
  const arch = os.arch() === "arm64" ? "arm64" : "x86_64";
  switch (process.platform) {
    case "darwin":
      return `go-pmtiles-${version}_Darwin_${arch}.zip`;
    case "linux":
      return `go-pmtiles_${version}_Linux_${arch}.tar.gz`;
    case "win32":
      return `go-pmtiles_${version}_Windows_${arch}.zip`;
    default:
      throw new Error(`unsupported platform: ${process.platform}`);
  }
}

/** Parses the size figures out of `pmtiles extract --dry-run` output. */
function parseDryRun(output: string): ExtractEstimate {
  const toBytes = (value: string, unit: string) => {
    const scale = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 }[unit.toUpperCase()] ?? 1;
    return Number(value) * scale;
  };
  const line = /transferred ([\d.]+) (\w+).*archive size of ([\d.]+) (\w+)/.exec(output);
  if (!line) return { archiveBytes: 0, transferBytes: 0 };
  return {
    transferBytes: toBytes(line[1]!, line[2]!),
    archiveBytes: toBytes(line[3]!, line[4]!),
  };
}

/** Wraps the go-pmtiles CLI, which does the actual range-request extraction. */
@Injectable()
export class PmtilesService {
  isInstalled(): Promise<boolean> {
    return exists(PATHS.pmtilesBin);
  }

  async version(): Promise<string> {
    return (await run(PATHS.pmtilesBin, ["version"], { quiet: true })).trim();
  }

  async install(report: Report = log): Promise<void> {
    if (await this.isInstalled()) {
      report(`${c.green("ok")} pmtiles already installed ${c.dim(await this.version())}`);
      return;
    }

    const asset = releaseAsset(UPSTREAM.pmtilesVersion);
    const url = UPSTREAM.pmtilesRelease(UPSTREAM.pmtilesVersion, asset);
    report(`${c.cyan("→")} downloading ${asset}`);

    const staging = path.join(PATHS.tmp, "pmtiles-install");
    await fs.rm(staging, { recursive: true, force: true });
    await fs.mkdir(staging, { recursive: true });
    const archive = path.join(staging, asset);

    try {
      await download(url, archive, {
        label: "pmtiles",
        onProgress: (received, total) =>
          report(`  pmtiles binary ${Math.round((received / (total || received)) * 100)}%`),
      });
      if (asset.endsWith(".zip")) {
        await run("unzip", ["-oq", archive, "-d", staging], { quiet: true });
      } else {
        await run("tar", ["-xzf", archive, "-C", staging], { quiet: true });
      }

      const binName = process.platform === "win32" ? "pmtiles.exe" : "pmtiles";
      const extracted = path.join(staging, binName);
      if (!(await exists(extracted))) throw new Error(`${binName} not found in ${asset}`);

      await fs.mkdir(PATHS.bin, { recursive: true });
      await fs.copyFile(extracted, PATHS.pmtilesBin);
      await fs.chmod(PATHS.pmtilesBin, 0o755);

      report(`${c.green("ok")} pmtiles installed ${c.dim(await this.version())}`);
    } catch (err) {
      report(`${c.yellow("!")} ${(err as Error).message}`);
      report(
        `${c.yellow("!")} could not install the pmtiles binary. Install it manually into ${c.bold("bin/pmtiles")},\n` +
          `  or use Docker: ${c.dim("docker run --rm -v $PWD:/w protomaps/go-pmtiles")}`,
      );
      throw err;
    } finally {
      await fs.rm(staging, { recursive: true, force: true });
    }
  }

  /** Measures what the extract would cost, without downloading tiles. */
  async estimate(options: ExtractOptions, hooks: ExtractHooks = {}): Promise<ExtractEstimate> {
    const output = await run(PATHS.pmtilesBin, [...this.args(options), "--dry-run"], {
      quiet: true,
      signal: hooks.signal,
      onOutput: (chunk) => hooks.onLog?.(chunk),
    });
    return parseDryRun(output);
  }

  /**
   * Runs the real extract. go-pmtiles draws a progress bar on stderr; we read
   * the percentage out of it and fall back to watching the output file grow,
   * so progress degrades rather than disappears if that format ever changes.
   */
  async extract(options: ExtractOptions, hooks: ExtractHooks = {}): Promise<void> {
    const total = hooks.totalBytes ?? 0;
    let percent: number | undefined;
    let bytes = 0;

    const emit = () => {
      const ratio = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
      hooks.onProgress?.({ bytes, total, percent: percent ?? ratio });
    };

    const poll = hooks.onProgress
      ? setInterval(() => {
          void fs
            .stat(options.outFile)
            .then((stat) => {
              bytes = stat.size;
              emit();
            })
            .catch(() => {});
        }, 1000)
      : undefined;

    try {
      await run(PATHS.pmtilesBin, this.args(options), {
        quiet: true,
        signal: hooks.signal,
        onOutput: (chunk) => {
          hooks.onLog?.(chunk);
          const matches = [...chunk.matchAll(/(\d{1,3})\s*%/g)];
          const last = matches.at(-1)?.[1];
          if (last !== undefined) {
            percent = Math.min(100, Number(last));
            emit();
          }
        },
      });
    } finally {
      if (poll) clearInterval(poll);
    }
  }

  /** Reads the header of a local archive to learn its real zoom range. */
  async readHeader(file: string): Promise<Header> {
    const handle = await fs.open(file, "r");
    try {
      const pmtiles = new PMTiles({
        getKey: () => file,
        getBytes: async (offset: number, length: number) => {
          const buf = Buffer.allocUnsafe(length);
          const { bytesRead } = await handle.read(buf, 0, length, offset);
          const out = new ArrayBuffer(bytesRead);
          new Uint8Array(out).set(buf.subarray(0, bytesRead));
          return { data: out };
        },
      });
      return await pmtiles.getHeader();
    } finally {
      await handle.close();
    }
  }

  private args(o: ExtractOptions): string[] {
    return [
      "extract",
      o.source,
      o.outFile,
      `--region=${o.regionFile}`,
      `--maxzoom=${o.maxzoom}`,
      `--minzoom=${o.minzoom}`,
    ];
  }
}
