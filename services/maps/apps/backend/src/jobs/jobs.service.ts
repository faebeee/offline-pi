import fs from "node:fs/promises";
import path from "node:path";
import { ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import type { Job, JobType } from "@offline-maps/shared";
import type { Observable } from "rxjs";
import { PATHS } from "../config/paths.ts";
import { RegistryService } from "../regions/registry.service.ts";
import { JobCancelledError, JobRecord, type JobRunner } from "./job.record.ts";

/** Finished jobs kept around so the UI can still show the last result. */
const KEEP_FINISHED = 20;

/**
 * In-memory job registry. Jobs are deliberately not persisted: a restart drops
 * them, and `onApplicationBootstrap` cleans up whatever half-written archive
 * they left behind.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);
  private readonly records = new Map<string, JobRecord>();

  constructor(private readonly registry: RegistryService) {}

  /** Deletes archives that no job will ever finish writing. */
  async onApplicationBootstrap(): Promise<void> {
    let files: string[];
    try {
      files = await fs.readdir(PATHS.regionsDir);
    } catch {
      return;
    }

    const known = new Set((await this.registry.readAll()).map((r) => `${r.name}.pmtiles`));
    for (const file of files) {
      if (!file.endsWith(".pmtiles") || known.has(file)) continue;
      await fs.rm(path.join(PATHS.regionsDir, file), { force: true });
      this.logger.warn(`removed orphaned archive ${file}`);
    }
  }

  list(): Job[] {
    return [...this.records.values()]
      .map((r) => r.job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Job {
    return this.record(id).job;
  }

  observe(id: string): Observable<Job> {
    return this.record(id).observe();
  }

  /** The job currently holding the lock, if any. */
  active(): Job | undefined {
    return [...this.records.values()].find((r) => !r.finished)?.job;
  }

  /**
   * Starts a job. Only one may run at a time — extracts saturate the disk and
   * the upstream connection, and two at once just make both slower.
   */
  start(
    type: JobType,
    stage: string,
    runner: JobRunner,
    region?: Job["region"],
  ): Job {
    const running = this.active();
    if (running) {
      throw new ConflictException(
        `another job is already running (${running.type}: ${running.stage})`,
      );
    }

    const record = new JobRecord(type, stage, region);
    this.records.set(record.job.id, record);
    this.prune();

    void this.run(record, runner);
    return record.job;
  }

  confirm(id: string): Job {
    const record = this.record(id);
    if (!record.confirm()) {
      throw new ConflictException(`job is ${record.job.state}, nothing to confirm`);
    }
    return record.job;
  }

  cancel(id: string): Job {
    const record = this.record(id);
    record.cancel();
    return record.job;
  }

  private async run(record: JobRecord, runner: JobRunner): Promise<void> {
    try {
      await runner(record.context());
      record.settle("done", "done");
    } catch (err) {
      if (err instanceof JobCancelledError || record.abort.signal.aborted) {
        record.settle("cancelled", "cancelled");
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`${record.job.type} job failed: ${message}`);
      record.settle("failed", "failed", message);
    }
  }

  private record(id: string): JobRecord {
    const record = this.records.get(id);
    if (!record) throw new NotFoundException(`unknown job "${id}"`);
    return record;
  }

  private prune(): void {
    const finished = [...this.records.values()]
      .filter((r) => r.finished)
      .sort((a, b) => a.job.createdAt.localeCompare(b.job.createdAt));
    for (const record of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) {
      this.records.delete(record.job.id);
    }
  }
}
