import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { assertControl, assertCsrf } from '../../../platform/http/control-guard';
import { BoardPost, BoardStatus, CreatePostRequest, POST_KINDS, type PostKind, UpdatePostRequest } from '../domain/board.dto';
import { BoardStore } from '../infrastructure/board.store';

/**
 * Domain "board": the notice board of everyone on the Pi's network
 * (notices, needs, offers, check-ins). Core keeps it itself
 * (CORE_DATA_DIR/board.json), there is no container.
 * Anyone may post, edit and mark done; pinning and deleting are control
 * actions (CONTROL_PIN).
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

  /** Change a post, mark it done, or pin it (pinning: control PIN). */
  @Patch('posts/:id')
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  @ApiHeader({ name: 'X-Control-Pin', required: false, description: 'CONTROL_PIN, when set and pinning' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePostRequest,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('x-control-pin') pin: string | undefined,
  ): Promise<BoardPost> {
    if (body.pinned !== undefined) assertControl(piMonitor, pin);
    else assertCsrf(piMonitor);
    return this.board.update(id, body);
  }

  /** Delete a post. */
  @Delete('posts/:id')
  @HttpCode(204)
  @ApiHeader({ name: 'X-Pi-Monitor', required: true, description: 'must be "1" (CSRF guard)' })
  @ApiHeader({ name: 'X-Control-Pin', required: false, description: 'CONTROL_PIN, when set' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('x-pi-monitor') piMonitor: string | undefined,
    @Headers('x-control-pin') pin: string | undefined,
  ): Promise<void> {
    assertControl(piMonitor, pin);
    return this.board.remove(id);
  }
}
