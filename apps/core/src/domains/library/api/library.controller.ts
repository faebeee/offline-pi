import { BadRequestException, Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { BooksResponse, LibrarySync, SearchResponse } from '../domain/library.dto';
import { KiwixClient } from '../infrastructure/kiwix.client';
import { SyncStatusReader } from '../infrastructure/sync-status.reader';

/**
 * Domain "library": offline Wikipedia, medical and survival guides (the
 * knowledge container, kiwix-serve). Articles open in kiwix's viewer through
 * the passthrough (/svc/library/).
 */
@ApiTags('library')
@Controller('api/library')
export class LibraryController {
  constructor(
    private readonly kiwix: KiwixClient,
    private readonly syncStatus: SyncStatusReader,
  ) {}

  /** Every installed book, by title. */
  @Get('books')
  async books(): Promise<BooksResponse> {
    return { books: await this.kiwix.books() };
  }

  /** Whether books from zims.txt are being downloaded in the background, and how far. */
  @Get('sync')
  sync(): Promise<LibrarySync> {
    return this.syncStatus.read();
  }

  /**
   * Full-text search. kiwix can't search across languages at once, so the
   * scope is one book (bookId) or every book of one language (lang).
   */
  @Get('search')
  @ApiQuery({ name: 'bookId', required: false })
  @ApiQuery({ name: 'lang', required: false })
  @ApiQuery({ name: 'start', required: false, type: Number })
  @ApiQuery({ name: 'pageLength', required: false, type: Number })
  search(
    @Query('q') q: string,
    @Query('bookId') bookId?: string,
    @Query('lang') lang?: string,
    @Query('start', new DefaultValuePipe(0), ParseIntPipe) start = 0,
    @Query('pageLength', new DefaultValuePipe(25), ParseIntPipe) pageLength = 25,
  ): Promise<SearchResponse> {
    if (!q?.trim()) throw new BadRequestException('q is empty');
    if (!bookId && !lang) throw new BadRequestException('give bookId or lang');
    return this.kiwix.search(q.trim(), { bookId, lang }, Math.max(0, start), Math.min(100, Math.max(1, pageLength)));
  }
}
