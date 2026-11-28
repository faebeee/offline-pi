import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { CATALOG } from '../domain/catalog';
import type { Book, SearchHit, SearchResponse } from '../domain/library.dto';
import { KiwixClient } from '../infrastructure/kiwix.client';

/** Medical books first: the emergency index takes the first book's best hit. */
const MEDICAL = new Set(CATALOG.find((g) => g.id === 'medical')?.items.map((i) => i.key) ?? []);

/**
 * Full-text search in the Library: one book, or every book of a language
 * that has a full-text index, named one by one. (kiwix's own language
 * filter also selects books without an index, and a book in several
 * languages, and then refuses the whole search with a 400.) When kiwix
 * still refuses a combination, the books are searched one after the other
 * and their results joined, in book order.
 */
@Injectable()
export class LibrarySearch {
  private readonly logger = new Logger('LibrarySearch');

  constructor(private readonly kiwix: KiwixClient) {}

  /** The searchable books of a scope, medical ones first. */
  async books(scope: { bookId?: string; lang?: string }): Promise<Book[]> {
    const all = await this.kiwix.books();
    const picked = scope.bookId
      ? all.filter((b) => b.id === scope.bookId)
      : all.filter((b) => b.fulltext && b.language === scope.lang);
    return picked.sort((a, b) => Number(MEDICAL.has(b.name)) - Number(MEDICAL.has(a.name)) || a.title.localeCompare(b.title));
  }

  async search(q: string, scope: { bookId?: string; lang?: string }, start: number, pageLength: number): Promise<SearchResponse> {
    const books = await this.books(scope);
    if (!books.length) {
      throw new BadRequestException(scope.bookId ? 'That book is not in the library.' : 'No book in this language has a full-text index.');
    }
    const ids = books.map((b) => b.id);
    try {
      return await this.kiwix.search(q, ids, start, pageLength);
    } catch (err) {
      if (!(err instanceof HttpException && err.getStatus() === 400) || ids.length === 1) throw err;
      this.logger.warn(`kiwix refused searching ${ids.length} books together (${(err as Error).message}); searching them one by one`);
      return this.oneByOne(q, books, start, pageLength);
    }
  }

  /** Each book on its own, results joined in book order; STAR/PAGE count over the joined list. */
  private async oneByOne(q: string, books: Book[], start: number, pageLength: number): Promise<SearchResponse> {
    const hits: SearchHit[] = [];
    let total = 0;
    let skip = start;
    for (const book of books) {
      let first: SearchResponse;
      try {
        first = await this.kiwix.search(q, [book.id], 0, 1);
      } catch (err) {
        this.logger.warn(`search in ${book.name} failed: ${(err as Error).message}`);
        continue;
      }
      total += first.total;
      if (hits.length >= pageLength || first.total === 0) continue;
      if (skip >= first.total) {
        skip -= first.total;
        continue;
      }
      const want = pageLength - hits.length;
      const page = skip === 0 && want === 1 ? first : await this.kiwix.search(q, [book.id], skip, want);
      hits.push(...page.hits.slice(0, want));
      skip = 0;
    }
    return { total, start, hits };
  }
}
