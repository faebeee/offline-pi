import { Body, Controller, Delete, Get, HttpCode, Param, Post } from "@nestjs/common";
import type { CreateDownloadRequest, Job, PartialDownloadsResponse } from "@outpost/maps-shared";
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

  /** Unfinished downloads (paused, failed, interrupted) that can be resumed. */
  @Get()
  async list(): Promise<PartialDownloadsResponse> {
    return { downloads: await this.downloads.list() };
  }

  /** Accepts the estimate and lets the extract run. */
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Param("id") id: string): Job {
    return this.jobs.confirm(id);
  }

  /** Goes on with an unfinished download from where it stopped. */
  @Post(":name/resume")
  @HttpCode(202)
  resume(@Param("name") name: string): Promise<Job> {
    return this.downloads.resume(name);
  }

  /** Deletes an unfinished download and what it fetched. */
  @Delete(":name")
  @HttpCode(204)
  async discard(@Param("name") name: string): Promise<void> {
    await this.downloads.discard(name);
  }
}
