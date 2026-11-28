import { Injectable, NotFoundException } from '@nestjs/common';
import { CATALOG } from '../domain/catalog';
import { EMERGENCY, STARTER_SET } from '../domain/emergency';
import type { Book, EmergencyArticle, EmergencyIndex } from '../domain/library.dto';
import { ContentDir } from '../infrastructure/content-dir';
import { KiwixClient } from '../infrastructure/kiwix.client';
import { LibrarySearch } from './search.service';

const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;

/**
 * The Library's "In an emergency" index (domain/emergency.ts): the topics,
 * the language they are searched in, and per topic the best article in the
 * installed books. Searches are cached for a while (per set of books), so the
 * index opens fast after the first visit even on a Pi.
 */
@Injectable()
export class EmergencyService {
  private readonly cache = new Map<string, { at: number; value: EmergencyArticle }>();

  constructor(
    private readonly kiwix: KiwixClient,
    private readonly content: ContentDir,
    private readonly search: LibrarySearch,
  ) {}

  /** English when an English book has a full-text index, else the language with the most such books. */
  static language(books: Book[]): string | null {
    const counts = new Map<string, number>();
    for (const b of books) if (b.fulltext && b.language) counts.set(b.language, (counts.get(b.language) ?? 0) + 1);
    if (counts.has('eng')) return 'eng';
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  async index(): Promise<EmergencyIndex> {
    const [books, installed] = await Promise.all([this.kiwix.books(), this.content.installed()]);
    const offered = new Map(CATALOG.flatMap((g) => g.items).map((i) => [i.key, i]));
    return {
      language: EmergencyService.language(books),
      groups: EMERGENCY.map((g) => ({ id: g.id, label: g.label, topics: g.topics.map((t) => ({ ...t })) })),
      starter: STARTER_SET.map((key) => {
        const item = offered.get(key);
        return { key, title: item?.title ?? key, size: Math.round(item?.size ?? 0), installed: installed.has(key) };
      }),
    };
  }

  async article(id: string): Promise<EmergencyArticle> {
    const topic = EMERGENCY.flatMap((g) => g.topics).find((t) => t.id === id);
    if (!topic) throw new NotFoundException(`unknown emergency topic "${id}"`);
    const books = await this.kiwix.books();
    const lang = EmergencyService.language(books);
    if (!lang) return { topic: id, hit: null, total: 0 };

    // a new or updated book changes the answer
    const key = `${id}|${lang}|${books.map((b) => b.id).sort().join(',')}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

    // medical books first: the top hit of the first book that has one
    const res = await this.search.search(topic.query, { lang }, 0, 1);
    const value: EmergencyArticle = { topic: id, hit: res.hits[0] ?? null, total: res.total };
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}
