import fs from "node:fs/promises";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Compression, PMTiles, type Header, type RangeResponse, type Source } from "pmtiles";
import { RegistryService } from "./registry.service.ts";

/**
 * Minimal Node source for PMTiles: serves the byte ranges the library asks for
 * straight out of an open file handle.
 */
class NodeFileSource implements Source {
  constructor(
    private readonly handle: fs.FileHandle,
    private readonly key: string,
  ) {}

  getKey(): string {
    return this.key;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await this.handle.read(buf, 0, length, offset);
    // Buffer may be pooled, so copy out the exact slice we read.
    const out = new ArrayBuffer(bytesRead);
    new Uint8Array(out).set(buf.subarray(0, bytesRead));
    return { data: out };
  }
}

/** Identity: hand tile bytes back untouched so we can stream them still-compressed. */
const passthrough = async (buf: ArrayBuffer) => buf;

export type Archive = {
  pmtiles: PMTiles;
  header: Header;
  handle: fs.FileHandle;
  /** value for Content-Encoding, or undefined if tiles are stored uncompressed */
  tileEncoding: string | undefined;
  contentType: string;
};

const TILE_CONTENT_TYPE: Record<number, string> = {
  1: "application/vnd.mapbox-vector-tile",
  2: "image/png",
  3: "image/jpeg",
  4: "image/webp",
  5: "image/avif",
};

const ENCODINGS: Record<number, string | undefined> = {
  [Compression.None]: undefined,
  [Compression.Unknown]: undefined,
  [Compression.Gzip]: "gzip",
  [Compression.Brotli]: "br",
  [Compression.Zstd]: "zstd",
};

/** Keeps one open PMTiles handle per region for the lifetime of the app. */
@Injectable()
export class ArchiveService implements OnModuleDestroy {
  private readonly cache = new Map<string, Promise<Archive>>();

  constructor(private readonly registry: RegistryService) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.cache.keys()].map((name) => this.close(name)));
  }

  /** Opens (once) and caches the archive for a region. */
  get(name: string): Promise<Archive> {
    let entry = this.cache.get(name);
    if (!entry) {
      entry = this.open(name).catch((err) => {
        this.cache.delete(name);
        throw err;
      });
      this.cache.set(name, entry);
    }
    return entry;
  }

  async close(name: string): Promise<void> {
    const entry = this.cache.get(name);
    if (!entry) return;
    this.cache.delete(name);
    await entry.then((a) => a.handle.close()).catch(() => {});
  }

  /** Reads a tile, still compressed as stored. Returns undefined when absent. */
  async readTile(
    name: string,
    z: number,
    x: number,
    y: number,
  ): Promise<Uint8Array | undefined> {
    const archive = await this.get(name);
    const result = await archive.pmtiles.getZxy(z, x, y);
    return result ? new Uint8Array(result.data) : undefined;
  }

  private async open(name: string): Promise<Archive> {
    const file = this.registry.regionFile(name);
    const handle = await fs.open(file, "r");
    try {
      const pmtiles = new PMTiles(new NodeFileSource(handle, file), undefined, passthrough);
      const header = await pmtiles.getHeader();
      return {
        pmtiles,
        header,
        handle,
        tileEncoding: ENCODINGS[header.tileCompression],
        contentType: TILE_CONTENT_TYPE[header.tileType] ?? "application/octet-stream",
      };
    } catch (err) {
      await handle.close();
      throw err;
    }
  }
}
