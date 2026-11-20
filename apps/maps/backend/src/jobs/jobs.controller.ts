import { Controller, Delete, Get, HttpCode, Param, Post, Sse } from "@nestjs/common";
import type { Job, JobsResponse } from "@outpost/maps-shared";
import { map, type Observable } from "rxjs";
import { JobsService } from "./jobs.service.ts";

type JobEvent = { data: Job };

@Controller("api/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  list(): JobsResponse {
    return { jobs: this.jobs.list() };
  }

  @Get(":id")
  get(@Param("id") id: string): Job {
    return this.jobs.get(id);
  }

  /**
   * Live job updates. The stream replays the current state on connect and
   * completes when the job settles, so a reloaded page picks up where it left.
   */
  @Sse(":id/events")
  events(@Param("id") id: string): Observable<JobEvent> {
    return this.jobs.observe(id).pipe(map((job) => ({ data: job })));
  }

  /** Pauses a running download: what it fetched is kept for a resume. */
  @Post(":id/pause")
  @HttpCode(200)
  pause(@Param("id") id: string): Job {
    return this.jobs.pause(id);
  }

  /**
   * Cancels a running job, or declines one waiting for confirmation. A
   * cancelled download deletes what it fetched.
   */
  @Delete(":id")
  cancel(@Param("id") id: string): Job {
    return this.jobs.cancel(id);
  }
}
