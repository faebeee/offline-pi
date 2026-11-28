import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Post, Put, Query, Req, Res, UnsupportedMediaTypeException } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { assertControl, assertCsrf } from '../../../platform/http/control-guard';
import { CreateFolderRequest, FileEntry, FilesStatus, FolderListing, MoveRequest } from '../domain/files.dto';
import { inlineSafe, mimeOf, RAW_PREFIX, SharedFolder } from '../infrastructure/shared-folder';

/** The file path of a raw URL: /api/files/raw/Photos/a%20b.jpg -> "Photos/a b.jpg". */
function rawPath(req: Request): string {
  const path = req.path.startsWith(RAW_PREFIX) ? req.path.slice(RAW_PREFIX.length) : '';
  try {
    return path.split('/').map(decodeURIComponent).join('/');
  } catch {
    throw new BadRequestException('Malformed path.');
  }
}

/**
 * Domain "files": a shared folder for everyone on the Pi's network, kept by
 * core itself (FILES_DATA_DIR mounted at FILES_DIR). The JSON routes list,
 * make folders, rename and delete; the raw routes stream the bytes
 * (GET downloads with range requests, PUT uploads). Deleting is a control
 * action (admin only), like blocking a device.
 */
@ApiTags('files')
@Controller('api/files')
export class FilesController {
  constructor(private readonly files: SharedFolder) {}

  /** Size of the shared folder, free space and the upload limits. */
  @Get('status')
  async status(): Promise<FilesStatus> {
    const u = await this.files.usage();
    return {
      usedBytes: u.bytes,
      files: u.files,
      folders: u.folders,
      freeBytes: await this.files.freeBytes(),
      maxUploadBytes: this.files.maxUploadBytes,
      minFreeBytes: this.files.minFreeBytes,
    };
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
    return this.files.mkdir(body.path);
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
  remove(
    @Query('path') path: string,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<void> {
    assertControl(piMonitor, user);
    if (!path?.trim()) throw new BadRequestException('path is empty');
    return this.files.remove(path);
  }

  /**
   * A file's bytes (?download=true: as an attachment). Images, audio, video,
   * PDF and plain text open in the browser; anything else, HTML and SVG
   * included, is only downloaded and sandboxed, so an uploaded page can't
   * run as part of outpost.
   */
  @Get('raw/*path')
  @ApiExcludeEndpoint()
  async download(@Req() req: Request, @Res() res: Response, @Query('download') download?: string): Promise<void> {
    const { rel, name } = await this.files.file(rawPath(req));
    const mime = mimeOf(name);
    const safe = inlineSafe(mime);
    const disposition = safe && download !== 'true' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    if (!safe) res.setHeader('Content-Security-Policy', 'sandbox');
    res.type(safe ? mime! : 'application/octet-stream');
    await new Promise<void>((resolve) =>
      res.sendFile(rel, { root: this.files.root, dotfiles: 'deny', acceptRanges: true, lastModified: true }, (err) => {
        if (err && !res.headersSent) res.status((err as { status?: number }).status ?? 500).end();
        resolve();
      }),
    );
  }

  /** Upload the request body as a file (?overwrite=true replaces one). */
  @Put('raw/*path')
  @HttpCode(201)
  @ApiExcludeEndpoint()
  upload(
    @Req() req: Request,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('content-type') type: string | undefined,
    @Headers('content-length') length: string | undefined,
    @Query('overwrite') overwrite?: string,
  ): Promise<FileEntry> {
    assertCsrf(piMonitor);
    // core parses JSON bodies; a file must come as raw bytes
    if (type?.includes('json')) throw new UnsupportedMediaTypeException('Send the file as application/octet-stream.');
    const n = length && /^\d+$/.test(length) ? Number(length) : null;
    return this.files.upload(rawPath(req), req, { overwrite: overwrite === 'true', length: n });
  }
}
