import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PodmanService } from '../../../platform/modules/podman.service';
import { LogEntry } from '../domain/logs.dto';
import { createLineParser } from './log-line.parser';
import { LogStreamDecoder } from './log-stream';

/** Reads module containers' logs through Podman's REST API (podman logs). */
@Injectable()
export class ContainerLogsClient {
  constructor(private readonly podman: PodmanService) {}

  /** Why container logs can't be read, or null. */
  get unavailableReason(): string | null {
    return this.podman.unavailableReason;
  }

  /** The last `tail` lines of a container, oldest first. */
  async tail(container: string, tail: number): Promise<LogEntry[]> {
    const res = await this.podman.logs(container, { tail, follow: false });
    const parse = createLineParser();
    const entries: LogEntry[] = [];
    const decoder = new LogStreamDecoder((line, stream) => entries.push(parse(line, stream)));
    await new Promise<void>((resolve, reject) => {
      res.on('data', (chunk: Buffer) => decoder.write(chunk));
      res.on('end', () => resolve());
      res.on('error', reject);
    });
    decoder.end();
    // stdout and stderr come in order per stream; sort them together by time
    return entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (a.e.ts ?? 0) - (b.e.ts ?? 0) || a.i - b.i)
      .map(({ e }) => e)
      .slice(-tail);
  }

  /**
   * New lines of a container while subscribed (podman logs --follow
   * --tail 0). Completes when the container stops, errors when podman
   * can't be reached; unsubscribing closes the stream.
   */
  follow(container: string): Observable<LogEntry> {
    return new Observable<LogEntry>((sub) => {
      const parse = createLineParser();
      const decoder = new LogStreamDecoder((line, stream) => sub.next(parse(line, stream)));
      let closed = false;
      let destroy: (() => void) | null = null;
      this.podman.logs(container, { tail: 0, follow: true }).then(
        (res) => {
          if (closed) return void res.destroy();
          destroy = () => res.destroy();
          res.on('data', (chunk: Buffer) => decoder.write(chunk));
          res.on('end', () => {
            decoder.end();
            sub.complete();
          });
          res.on('error', (err) => sub.error(err));
        },
        (err: Error) => sub.error(err),
      );
      return () => {
        closed = true;
        destroy?.();
      };
    });
  }
}
