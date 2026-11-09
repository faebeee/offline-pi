// The library domain: offline books (ZIM files) served by kiwix-serve in the
// knowledge container. Articles themselves are read through core's
// passthrough (/svc/library/...), kiwix renders them.

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
