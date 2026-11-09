import type { LogLevel } from '@nestjs/common';
import { Subject } from 'rxjs';

/** One line core logged through Nest's Logger (see CoreLogger). */
export interface CoreLogRecord {
  /** ms since epoch */
  ts: number;
  level: LogLevel;
  context: string | null;
  /** the message, plus the stack trace for errors (multi-line) */
  message: string;
}

/**
 * The last `size` lines core logged, kept in memory for the logs screen,
 * plus a live feed of new ones. Filled by CoreLogger, which Nest uses for
 * every `new Logger(...)` in core, so no domain has to know about it.
 */
export class LogBuffer {
  private readonly records: CoreLogRecord[] = [];
  private readonly feed = new Subject<CoreLogRecord>();
  readonly records$ = this.feed.asObservable();

  constructor(private readonly size: number) {}

  push(record: CoreLogRecord) {
    this.records.push(record);
    if (this.records.length > this.size) this.records.splice(0, this.records.length - this.size);
    this.feed.next(record);
  }

  /** The last `n` records, oldest first. */
  tail(n: number): CoreLogRecord[] {
    return this.records.slice(-Math.max(0, n));
  }
}

/** core's one buffer: created before Nest (main.ts), provided by PlatformModule. */
export const coreLogBuffer = new LogBuffer(2000);
