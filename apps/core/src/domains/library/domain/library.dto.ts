// The library domain: offline books (ZIM files) served by kiwix-serve in the
// knowledge container. Articles themselves are read through core's
// passthrough (/svc/library/...), kiwix renders them.
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class Book {
  /** kiwix book id (uuid) */
  id!: string;
  /** kiwix book name, part of its content URLs */
  name!: string;
  title!: string;
  summary!: string;
  /** ISO 639-3 code(s) of the first language, e.g. "eng" */
  language!: string;
  articleCount!: number;
  /** bytes of the ZIM file, when known */
  size!: number | null;
  /** YYYY-MM */
  date!: string;
  /** has a full-text index (searchable), otherwise titles only */
  fulltext!: boolean;
  /** kiwix's viewer with its toolbar, e.g. /svc/library/viewer#wikipedia_en_all */
  viewerUrl!: string;
  /** the book's main page, e.g. /svc/library/content/wikipedia_en_all */
  contentUrl!: string;
}

export class BooksResponse {
  books!: Book[];
}

export class SearchHit {
  title!: string;
  /** article URL under the passthrough */
  url!: string;
  /** kiwix viewer URL for the article */
  viewerUrl!: string;
  /** plain-text excerpt */
  snippet!: string;
  /** title of the book it is in */
  book!: string;
  wordCount!: number | null;
}

export class SearchResponse {
  total!: number;
  start!: number;
  hits!: SearchHit[];
}

/** What the knowledge container's background sync (downloads of the selected books) is doing. */
export class LibrarySync {
  /** running = downloading or checking now; unknown = no status yet (never synced, or not readable) */
  state!: 'running' | 'idle' | 'unknown';
  /** while running: checking what's missing, fetching the Kiwix catalog, downloading a book */
  phase!: 'checking' | 'catalog' | 'downloading' | null;
  /** ZIM file being downloaded */
  file!: string | null;
  /** its size in bytes */
  size!: number | null;
  /** bytes on disk so far (approximate: from the partial file), null when unknown */
  downloadedBytes!: number | null;
  /** position of the current book in the selection (1-based), 0 when none */
  index!: number;
  /** selected books */
  count!: number;
  /** books that failed in this run */
  failed!: number;
  /** last finished run: ok, problems or interrupted */
  result!: 'ok' | 'problems' | 'interrupted' | null;
  message!: string | null;
  /** unix seconds */
  startedAt!: number | null;
  /** unix seconds, last status change */
  updatedAt!: number | null;
}

/**
 * A book offered for download. installed = on disk; downloading = the sync
 * is fetching it now; queued = selected, the running sync gets to it;
 * missing = selected but not on disk and no sync running (the last one
 * failed or was interrupted); available = not selected.
 */
export class CatalogBook {
  /** Kiwix name: the ZIM file name without date suffix and ".zim" */
  key!: string;
  title!: string;
  description!: string;
  /** bytes: the installed file's size, else the approximate download size; null when unknown */
  size!: number | null;
  /** ISO 639-3, when known */
  language!: string | null;
  selected!: boolean;
  state!: 'installed' | 'downloading' | 'queued' | 'missing' | 'available';
}

export class CatalogGroup {
  id!: string;
  label!: string;
  books!: CatalogBook[];
}

/** The books on offer, grouped, with what is selected and installed. */
export class LibraryCatalog {
  groups!: CatalogGroup[];
  /** bytes free in KNOWLEDGE_CONTENT_DIR, null when unknown */
  freeBytes!: number | null;
}

/** The complete new selection; books left out are deleted. */
export class SelectionRequest {
  /** Kiwix names, e.g. "wikipedia_en_medicine_maxi" */
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/, { each: true, message: 'each key must be a Kiwix name like wikipedia_en_all_maxi' })
  keys!: string[];
}

export class StartSyncRequest {
  /** also download newer versions of installed books (old files stay until pruned) */
  @IsOptional()
  @IsBoolean()
  update?: boolean;
}
