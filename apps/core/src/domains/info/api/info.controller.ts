import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InfoService } from '../application/info.service';
import { InfoIndex, InfoPage, InfoPageQuery, InfoSearchQuery, InfoSearchResult } from '../domain/info.dto';

/**
 * Domain "info": the project documentation, the Markdown files of the repo's
 * docs/ folder (also readable without the app).
 */
@ApiTags('info')
@Controller('api/info')
export class InfoController {
  constructor(private readonly info: InfoService) {}

  /** Every page in reading order, for the chapter navigation. */
  @Get()
  index(): Promise<InfoIndex> {
    return this.info.index();
  }

  /** One page's Markdown, with the pages before and after it. */
  @Get('page')
  page(@Query() query: InfoPageQuery): Promise<InfoPage> {
    return this.info.page(query.slug ?? '');
  }

  /** Pages whose title or text contains every word of the query. */
  @Get('search')
  search(@Query() query: InfoSearchQuery): Promise<InfoSearchResult> {
    return this.info.search(query.q);
  }
}
