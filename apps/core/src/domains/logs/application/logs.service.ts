import { Injectable, NotFoundException } from '@nestjs/common';
import { bufferTime, filter, map, Observable, share } from 'rxjs';
import { LogBuffer, type CoreLogRecord } from '../../../platform/logging/log-buffer';
import { ModulesService } from '../../../platform/modules/modules.service';
import { LogEntry, LogPage, LogSource, LogSources } from '../domain/logs.dto';
import { toLevel } from '../infrastructure/log-line.parser';
import { ContainerLogsClient } from '../infrastructure/container-logs.client';

const CORE: LogSource = { id: 'core', label: 'Core', kind: 'core', container: 'offline-pi-core', state: 'running' };

/** Live lines are sent at most this often, in batches (a chatty module can't flood the browser). */
const BATCH_MS = 250;

const fromCore = (r: CoreLogRecord): LogEntry => ({
  ts: r.ts,
  level: toLevel(r.level),
  context: r.context,
  message: r.message,
  stream: null,
});

/**
 * The logs of every part of offline-pi: core's own lines come from its Nest
 * logger (CoreLogger -> LogBuffer, in memory since core started); every
 * installed module's from its container (podman logs), parsed into levels.
 */
@Injectable()
export class LogsService {
  /** one shared live feed per source, opened on the first follower, closed after the last */
  private readonly feeds = new Map<string, Observable<LogEntry[]>>();

  constructor(
    private readonly modules: ModulesService,
    private readonly buffer: LogBuffer,
    private readonly containers: ContainerLogsClient,
  ) {}

  sources(): LogSources {
    const modules = this.modules
      .list()
      .filter((m) => m.optional && m.installed)
      .map((m): LogSource => ({ id: m.id, label: m.label, kind: 'container', container: m.container, state: m.state }));
    return { sources: [CORE, ...modules], containerError: this.containers.unavailableReason };
  }

  source(id: string): LogSource {
    const s = this.sources().sources.find((x) => x.id === id);
    if (!s) throw new NotFoundException(`no log source "${id}" (not an installed module)`);
    return s;
  }

  async entries(id: string, tail: number): Promise<LogPage> {
    const s = this.source(id);
    if (s.kind === 'core') {
      return { source: id, available: true, error: null, entries: this.buffer.tail(tail).map(fromCore) };
    }
    try {
      return { source: id, available: true, error: null, entries: await this.containers.tail(s.container, tail) };
    } catch (err) {
      return { source: id, available: false, error: (err as Error).message, entries: [] };
    }
  }

  /** New lines of a source, in batches; errors when its stream fails, completes when it ends. */
  live(id: string): Observable<LogEntry[]> {
    const s = this.source(id);
    let feed = this.feeds.get(id);
    if (!feed) {
      const lines =
        s.kind === 'core' ? this.buffer.records$.pipe(map(fromCore)) : this.containers.follow(s.container);
      feed = lines.pipe(
        bufferTime(BATCH_MS),
        filter((batch) => batch.length > 0),
        share(),
      );
      this.feeds.set(id, feed);
    }
    return feed;
  }
}
