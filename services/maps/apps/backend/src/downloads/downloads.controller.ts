import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import type { CreateDownloadRequest, Job } from "@offline-maps/shared";
import { JobsService } from "../jobs/jobs.service.ts";
import { DownloadService } from "./download.service.ts";

@Controller("api/downloads")
export class DownloadsController {
  constructor(
    private readonly downloads: DownloadService,
    private readonly jobs: JobsService,
  ) {}

  /** Starts a download job. It parks in `awaiting-confirmation` with an estimate. */
  @Post()
  @HttpCode(202)
  create(@Body() body: CreateDownloadRequest): Promise<Job> {
    return this.downloads.start(body ?? ({} as CreateDownloadRequest));
  }

  /** Accepts the estimate and lets the extract run. */
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Param("id") id: string): Job {
    return this.jobs.confirm(id);
  }
}
