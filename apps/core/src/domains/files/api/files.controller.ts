import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { assertControl, assertCsrf } from '../../../platform/http/control-guard';
import { CreateFolderRequest, FileEntry, FilesStatus, FolderListing, MoveRequest } from '../domain/files.dto';
import { FilesClient } from '../infrastructure/files.client';

/**
 * Domain "files": a shared folder for everyone on the Pi's network, backed
 * by the files container. Listing, folders, renaming and deleting go
 * through here; the bytes stream through the passthrough
 * (GET/PUT /svc/files/raw/<path>). Deleting is a control action
 * (CONTROL_PIN), like blocking a device.
 */
@ApiTags('files')
@Controller('api/files')
export class FilesController {
  constructor(private readonly files: FilesClient) {}

  /** Size of the shared folder, free space and the upload limits. */
  @Get('status')
  status(): Promise<FilesStatus> {
    return this.files.status();
  }

  /** One folder's files and folders, folders first, by name. */
  @Get('list')
  @ApiQuery({ name: 'path', required: false, description: 'the folder, empty for the top' })
  list(@Query('path') path?: string): Promise<FolderListing> {
    return this.files.list(path ?? '');
  }

  /** Make a folder (its parent must exist). */
  @Post('folders')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  createFolder(@Body() body: CreateFolderRequest, @Headers('x-pi-monitor') piMonitor: string | undefined): Promise<FileEntry> {
    assertCsrf(piMonitor);
    return this.files.createFolder(body.path);
  }

  /** Rename or move a file or folder. */
  @Post('move')
  @HttpCode(200)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  move(@Body() body: MoveRequest, @Headers('x-pi-monitor') piMonitor: string | undefined): Promise<FileEntry> {
    assertCsrf(piMonitor);
    return this.files.move(body.from, body.to);
  }

  /** Delete a file, or a folder with everything in it. */
  @Delete('entries')
  @HttpCode(204)
  @ApiQuery({ name: 'path', required: true })
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  @ApiHeader({ name: 'X-Control-Pin', required: false, description: 'CONTROL_PIN, when set' })
  remove(
    @Query('path') path: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('x-control-pin') pin: string | undefined,
  ): Promise<void> {
    assertControl(piMonitor, pin);
    if (!path?.trim()) throw new BadRequestException('path is empty');
    return this.files.remove(path);
  }
}
