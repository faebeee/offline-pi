import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { UpstreamService } from '../../../platform/upstream/upstream.service';
import type { Book, SearchHit, SearchResponse } from '../domain/library.dto';

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  textNodeName: '#text',
  isArray: (name) => ['entry', 'link', 'item'].includes(name),
});

const text = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return text((v as Node)['#text']);
  return String(v).trim();
};

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * kiwix-serve in the knowledge container: the OPDS catalogue (Atom XML) and
 * full-text search (format=xml), parsed into the library domain's model.
 * kiwix runs with --urlRootLocation=/svc/library, so its URLs already point
 * at core's passthrough.
 */
@Injectable()
export class KiwixClient {
  constructor(private readonly upstream: UpstreamService) {}

  private get c() {
    return this.upstream.client('knowledge');
  }

  private get root(): string {
    return this.c.module.svcPath.slice(0, -1);
  }

  /** viewer URL for a content URL: <root>/content/<book>/<path> -> <root>/viewer#<book>/<path> */
  private viewer(href: string): string {
    const content = `${this.root}/content/`;
    return href.startsWith(content) ? `${this.root}/viewer#${href.slice(content.length)}` : href || `${this.root}/`;
  }

  async books(): Promise<Book[]> {
    const xml = await this.c.text('/catalog/v2/entries', { query: { count: -1 } });
    const feed = (parser.parse(xml) as Node).feed as Node | undefined;
    const entries = (feed?.entry as Node[] | undefined) ?? [];
    return entries
      .map((e) => {
        const links = (e.link as Node[] | undefined) ?? [];
        const html = links.find((l) => l['@type'] === 'text/html');
        const zim = links.find((l) => l['@type'] === 'application/x-zim');
        const href = text(html?.['@href']);
        const name = text(e.name);
        const contentUrl = href || `${this.root}/content/${name}`;
        return {
          id: text(e.id).replace(/^urn:uuid:/, ''),
          name,
          title: text(e.title) || name || 'Untitled',
          summary: text(e.summary),
          language: text(e.language).split(',')[0] ?? '',
          articleCount: Number(text(e.articleCount)) || 0,
          size: Number(zim?.['@length']) || null,
          date: (text(e.issued) || text(e.updated)).slice(0, 7),
          fulltext: text(e.tags).split(';').includes('_ftindex:yes'),
          contentUrl,
          viewerUrl: this.viewer(contentUrl),
        } satisfies Book;
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Full-text search in one book or every book of one language. */
  async search(q: string, scope: { bookId?: string; lang?: string }, start: number, pageLength: number): Promise<SearchResponse> {
    const query: Record<string, string | number> = { pattern: q, format: 'xml', start, pageLength };
    if (scope.bookId) query['books.id'] = scope.bookId;
    else if (scope.lang) query['books.filter.lang'] = scope.lang;
    const xml = await this.c.text('/search', { query, timeoutMs: 30_000 });
    const channel = ((parser.parse(xml) as Node).rss as Node | undefined)?.channel as Node | undefined;
    const items = (channel?.item as Node[] | undefined) ?? [];
    const hits: SearchHit[] = items.map((i) => {
      const url = text(i.link);
      return {
        title: stripHtml(text(i.title)),
        url,
        viewerUrl: this.viewer(url),
        snippet: stripHtml(text(i.description)),
        book: text((i.book as Node | undefined)?.title),
        wordCount: Number(text(i.wordCount)) || null,
      };
    });
    return { total: Number(text(channel?.totalResults)) || hits.length, start, hits };
  }
}
