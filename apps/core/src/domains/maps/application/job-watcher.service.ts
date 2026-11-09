import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { Job } from '../domain/maps.dto';
import { MapsClient } from '../infrastructure/maps.client';

const finished = (j: Job) => j.state === 'done' || j.state === 'failed' || j.state === 'cancelled';

/**
 * Follows maps jobs for the /maps socket namespace: one upstream SSE stream
 * per watched job, shared by every browser watching it, closed when the job
 * settles or nobody watches any more. Reconnects while the job runs.
 */
@Injectable()
export class JobWatcher implements OnModuleDestroy {
  private readonly logger = new Logger(JobWatcher.name);
  private readonly streams = new Map<string, AbortController>();
  readonly updates$ = new Subject<Job>();

  constructor(private readonly maps: MapsClient) {}

  watch(id: string) {
    if (this.streams.has(id)) return;
    const ctl = new AbortController();
    this.streams.set(id, ctl);
    void this.follow(id, ctl);
  }

  unwatch(id: string) {
    this.streams.get(id)?.abort();
    this.streams.delete(id);
  }

  watched(): string[] {
    return [...this.streams.keys()];
  }

  onModuleDestroy() {
    for (const ctl of this.streams.values()) ctl.abort();
    this.streams.clear();
  }

  private async follow(id: string, ctl: AbortController) {
    let delay = 1000;
    while (!ctl.signal.aborted) {
      try {
        for await (const job of this.maps.watchJob(id, ctl.signal)) {
          delay = 1000;
          this.updates$.next(job);
          if (finished(job)) {
            this.unwatch(id);
            return;
          }
        }
      } catch (err) {
        if (ctl.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) {
          this.unwatch(id);
          return;
        }
        this.logger.debug(`job ${id}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15_000);
    }
  }
}
