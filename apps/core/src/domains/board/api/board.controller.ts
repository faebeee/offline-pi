import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../platform/auth/current-user.decorator';
import type { SessionUser } from '../../../platform/auth/auth.service';
import { assertControl, assertCsrf } from '../../../platform/http/control-guard';
import { BoardPost, BoardStatus, CreatePostRequest, POST_KINDS, type PostKind, UpdatePostRequest } from '../domain/board.dto';
import { BoardStore } from '../infrastructure/board.store';

/**
 * Domain "board": the notice board of everyone on the Pi's network
 * (notices, needs, offers, check-ins). Core keeps it itself
 * (CORE_DATA_DIR/board.json), there is no container.
 * Anyone may post, edit and mark done; pinning and deleting are control
 * actions (admin only).
 */
@ApiTags('board')
@Controller('api/board')
export class BoardController {
  constructor(private readonly board: BoardStore) {}

  /** Number of posts per kind, open and done. */
  @Get('status')
  status(): BoardStatus {
    return this.board.status();
  }

  /** Every post: pinned first, done last, newest change first. */
  @Get('posts')
  @ApiQuery({ name: 'kind', required: false, enum: POST_KINDS })
  @ApiQuery({ name: 'includeDone', required: false, type: Boolean })
  posts(@Query('kind') kind?: string, @Query('includeDone') includeDone?: string): BoardPost[] {
    if (kind && !POST_KINDS.includes(kind as PostKind)) throw new BadRequestException(`unknown kind "${kind}"`);
    return this.board.list((kind || undefined) as PostKind | undefined, includeDone !== 'false');
  }

  /** Add a post. */
  @Post('posts')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  create(@Body() body: CreatePostRequest, @Headers('x-pi-monitor') piMonitor: string | undefined): Promise<BoardPost> {
    assertCsrf(piMonitor);
    return this.board.create(body);
  }

  /** Change a post, mark it done, or pin it (pinning: admin only). */
  @Patch('posts/:id')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePostRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<BoardPost> {
    if (body.pinned !== undefined) assertControl(piMonitor, user);
    else assertCsrf(piMonitor);
    return this.board.update(id, body);
  }

  /** Delete a post. */
  @Delete('posts/:id')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<void> {
    assertControl(piMonitor, user);
    return this.board.remove(id);
  }
}
