import { Injectable } from '@nestjs/common';
import { CATALOG } from '../domain/catalog';
import type { CatalogBook, CatalogGroup, LibraryCatalog } from '../domain/library.dto';
import { ContentDir, zimKey } from '../infrastructure/content-dir';
import { KnowledgeCommands } from '../infrastructure/knowledge.commands';
import { SyncStatusReader } from '../infrastructure/sync-status.reader';

/**
 * The Library screen's book selection: the offered books (domain/catalog.ts)
 * plus any other selected or installed one, each with its state from the
 * content dir (selection.txt, zim/, the sync status).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly content: ContentDir,
    private readonly syncStatus: SyncStatusReader,
    private readonly commands: KnowledgeCommands,
  ) {}

  async catalog(): Promise<LibraryCatalog> {
    const [selection, installed, sync, freeBytes] = await Promise.all([
      this.content.selection(),
      this.content.installed(),
      this.syncStatus.read(),
      this.content.freeBytes(),
    ]);
    const selected = new Set(selection);
    const running = sync.state === 'running';
    const current = running && sync.file ? zimKey(sync.file) : null;

    const book = (key: string, title: string, description: string, size: number | null, language: string | null): CatalogBook => {
      const file = installed.get(key);
      const isSelected = selected.has(key);
      let state: CatalogBook['state'] = 'available';
      if (file) state = 'installed';
      else if (key === current) state = 'downloading';
      else if (isSelected) state = running ? 'queued' : 'missing';
      return {
        key,
        title,
        description,
        size: file ? file.size : size === null ? null : Math.round(size),
        language,
        selected: isSelected,
        state,
      };
    };

    const offered = new Set<string>();
    const groups: CatalogGroup[] = CATALOG.map((g) => ({
      id: g.id,
      label: g.label,
      books: g.items.map((i) => {
        offered.add(i.key);
        return book(i.key, i.title, i.description, i.size, i.language);
      }),
    }));

    // selected or installed books the catalog doesn't offer (added by name)
    const others = [...new Set([...selection, ...installed.keys()])]
      .filter((k) => !offered.has(k))
      .sort()
      .map((k) => book(k, k, 'Added by its Kiwix name.', null, null));
    if (others.length) groups.push({ id: 'other', label: 'Other books', books: others });

    return { groups, freeBytes };
  }

  async select(keys: string[]): Promise<LibraryCatalog> {
    await this.commands.apply([...new Set(keys)]);
    return this.catalog();
  }
}
