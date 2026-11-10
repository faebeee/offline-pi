/**
 * Splits podman's log body into lines. Containers without a TTY (all of
 * outpost's) answer in the multiplexed format: frames of an 8 byte header
 * (byte 0 = stream: 1 stdout, 2 stderr; bytes 4..7 = payload size, big
 * endian) and the payload. With a TTY the body is the raw output. Lines can
 * span frames and chunks, so each stream keeps its unfinished line.
 */
export class LogStreamDecoder {
  private mode: 'unknown' | 'mux' | 'raw' = 'unknown';
  private pending: Buffer = Buffer.alloc(0);
  private partial: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

  constructor(private readonly onLine: (line: string, stream: 'stdout' | 'stderr') => void) {}

  write(chunk: Buffer) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    if (this.mode === 'unknown') {
      if (this.pending.length < 8) return;
      const b = this.pending;
      this.mode = b[0] <= 2 && b[1] === 0 && b[2] === 0 && b[3] === 0 ? 'mux' : 'raw';
    }
    if (this.mode === 'raw') {
      this.text(this.pending.toString('utf8'), 'stdout');
      this.pending = Buffer.alloc(0);
      return;
    }
    let offset = 0;
    while (this.pending.length - offset >= 8) {
      const size = this.pending.readUInt32BE(offset + 4);
      if (this.pending.length - offset - 8 < size) break;
      const stream = this.pending[offset] === 2 ? 'stderr' : 'stdout';
      this.text(this.pending.toString('utf8', offset + 8, offset + 8 + size), stream);
      offset += 8 + size;
    }
    this.pending = this.pending.subarray(offset);
  }

  /** Flushes unfinished lines (end of a non-followed response). */
  end() {
    for (const stream of ['stdout', 'stderr'] as const) {
      if (this.partial[stream]) this.onLine(this.partial[stream], stream);
      this.partial[stream] = '';
    }
  }

  private text(text: string, stream: 'stdout' | 'stderr') {
    const lines = (this.partial[stream] + text).split('\n');
    this.partial[stream] = lines.pop() ?? '';
    for (const line of lines) this.onLine(line, stream);
  }
}
