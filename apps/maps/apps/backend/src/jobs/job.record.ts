import { randomUUID } from "node:crypto";
import { BehaviorSubject, type Observable } from "rxjs";
import type { DownloadEstimate, Job, JobProgress, JobState, JobType } from "@offline-maps/shared";

/** Raised when a job is cancelled; carried through to a `cancelled` state. */
export class JobCancelledError extends Error {
  constructor() {
    super("cancelled");
  }
}

/** Handle a running job uses to report back. */
export type JobContext = {
  readonly signal: AbortSignal;
  log(line: string): void;
  setStage(stage: string, state?: JobState): void;
  setEstimate(estimate: DownloadEstimate): void;
  setProgress(progress: JobProgress | undefined): void;
  /** Parks the job in `awaiting-confirmation` until confirmed or cancelled. */
  awaitConfirmation(): Promise<void>;
};

export type JobRunner = (ctx: JobContext) => Promise<void>;

const MAX_LOG_LINES = 200;

/**
 * One tracked job: the snapshot handed to clients, plus the plumbing to update
 * and cancel it.
 */
export class JobRecord {
  readonly job: Job;
  readonly updates: BehaviorSubject<Job>;
  readonly abort = new AbortController();

  private confirmation?: { resolve: () => void; reject: (err: Error) => void };

  constructor(type: JobType, stage: string, region?: Job["region"]) {
    const now = new Date().toISOString();
    this.job = {
      id: randomUUID(),
      type,
      state: "running",
      stage,
      createdAt: now,
      updatedAt: now,
      region,
      log: [],
    };
    this.updates = new BehaviorSubject<Job>({ ...this.job });
  }

  get finished(): boolean {
    const { state } = this.job;
    return state === "done" || state === "failed" || state === "cancelled";
  }

  observe(): Observable<Job> {
    return this.updates.asObservable();
  }

  context(): JobContext {
    return {
      signal: this.abort.signal,
      log: (line) => this.appendLog(line),
      setStage: (stage, state) => {
        this.job.stage = stage;
        if (state) this.job.state = state;
        this.touch();
      },
      setEstimate: (estimate) => {
        this.job.estimate = estimate;
        this.touch();
      },
      setProgress: (progress) => {
        this.job.progress = progress;
        this.touch();
      },
      awaitConfirmation: () =>
        new Promise<void>((resolve, reject) => {
          if (this.abort.signal.aborted) {
            reject(new JobCancelledError());
            return;
          }
          this.confirmation = { resolve, reject };
          this.job.state = "awaiting-confirmation";
          this.job.stage = "waiting for confirmation";
          this.touch();
        }),
    };
  }

  confirm(): boolean {
    if (this.job.state !== "awaiting-confirmation" || !this.confirmation) return false;
    const { resolve } = this.confirmation;
    this.confirmation = undefined;
    this.job.state = "running";
    this.touch();
    resolve();
    return true;
  }

  cancel(): void {
    if (this.finished) return;
    this.abort.abort();
    const pending = this.confirmation;
    this.confirmation = undefined;
    pending?.reject(new JobCancelledError());
  }

  settle(state: "done" | "failed" | "cancelled", stage: string, error?: string): void {
    this.job.state = state;
    this.job.stage = stage;
    if (error) this.job.error = error;
    if (state === "done" && this.job.progress) {
      this.job.progress = { ...this.job.progress, percent: 100 };
    }
    this.touch();
    this.updates.complete();
  }

  private appendLog(line: string): void {
    for (const part of line.split("\n")) {
      const text = part.replace(/\r/g, "").trimEnd();
      if (text) this.job.log.push(text);
    }
    if (this.job.log.length > MAX_LOG_LINES) {
      this.job.log.splice(0, this.job.log.length - MAX_LOG_LINES);
    }
    this.touch();
  }

  private touch(): void {
    this.job.updatedAt = new Date().toISOString();
    this.updates.next({ ...this.job, log: [...this.job.log] });
  }
}
