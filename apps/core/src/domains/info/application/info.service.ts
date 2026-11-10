import { Injectable, NotFoundException } from '@nestjs/common';
import { InfoEntry, InfoIndex, InfoPage, InfoSearchHit, InfoSearchResult } from '../domain/info.dto';
import { CHANGELOG_FILE, DocFile, DocsReader, plainText } from '../infrastructure/docs.reader';

const entry = ({ slug, title, depth, file }: DocFile): InfoEntry => ({ slug, title, depth, file });

const MAX_HITS = 25;

@Injectable()
export class InfoService {
  constructor(private readonly docs: DocsReader) {}

  async index(): Promise<InfoIndex> {
    const [files, version] = await Promise.all([this.docs.files(), this.docs.version()]);
    const changelog = files.find((f) => f.file === CHANGELOG_FILE)?.slug ?? null;
    return { entries: files.map(entry), root: 'docs/', version, changelog };
  }

  async page(slug = ''): Promise<InfoPage> {
    const files = await this.docs.files();
    const wanted = slug.replace(/^\/+|\/+$/g, '');
    const i = files.findIndex((f) => f.slug === wanted);
    if (i < 0) throw new NotFoundException(`No documentation page "${wanted}"`);
    const f = files[i];
    // the chapters above: the nearest shallower entry, walking back
    const trail: InfoEntry[] = [];
    let depth = f.depth;
    for (let j = i - 1; j >= 0 && depth > 1; j--) {
      if (files[j].depth < depth) {
        trail.unshift(entry(files[j]));
        depth = files[j].depth;
      }
    }
    return {
      ...entry(f),
      markdown: f.markdown,
      prev: i > 0 ? entry(files[i - 1]) : null,
      next: i < files.length - 1 ? entry(files[i + 1]) : null,
      trail: trail.filter((t) => t.depth > 0),
    };
  }

  /**
   * Pages that contain every word of the query (case-insensitive, title or
   * text); pages with the words in their title first, then by frequency.
   */
  async search(query: string): Promise<InfoSearchResult> {
    const terms = [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length > 0))];
    if (!terms.length) return { query, hits: [] };
    const scored: { hit: InfoSearchHit; score: number }[] = [];
    for (const f of await this.docs.files()) {
      const title = f.title.toLowerCase();
      const text = f.markdown.toLowerCase();
      if (!terms.every((t) => title.includes(t) || text.includes(t))) continue;
      // the line with the most words of the query (outside code fences)
      let best = '';
      let bestCount = 0;
      let fence = false;
      for (const line of f.markdown.split('\n')) {
        if (/^\s*```/.test(line)) {
          fence = !fence;
          continue;
        }
        if (fence || /^#\s/.test(line)) continue;
        const l = line.toLowerCase();
        const count = terms.filter((t) => l.includes(t)).length;
        if (count > bestCount) {
          best = line;
          bestCount = count;
        }
      }
      const inTitle = terms.filter((t) => title.includes(t)).length;
      const frequency = terms.reduce((n, t) => n + text.split(t).length - 1, 0);
      scored.push({
        hit: { ...entry(f), snippet: snippet(plainText(best.replace(/^\s*(#+|[-*>]|\d+\.|\|)\s*/, '')), terms[0]) },
        score: inTitle * 1000 + bestCount * 50 + frequency,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return { query, hits: scored.slice(0, MAX_HITS).map((s) => s.hit) };
  }
}

/** ~160 characters around the first match. */
function snippet(text: string, q: string): string {
  const at = text.toLowerCase().indexOf(q);
  if (text.length <= 160 || at < 0) return text.slice(0, 160);
  const start = Math.max(0, at - 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 160)}${start + 160 < text.length ? '…' : ''}`;
}
