// Classes, not interfaces: the @nestjs/swagger CLI plugin (nest-cli.json)
// reads them into the OpenAPI document, so the web app gets the same types.
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * One Markdown file of the docs/ folder. Folders are chapters; a folder's
 * README.md is the chapter page.
 */
export class InfoEntry {
  /**
   * URL path of the page: the file path without numeric prefixes, ".md" and
   * "README" ("02-installation/01-install.md" -> "installation/install",
   * "README.md" -> "")
   */
  slug!: string;
  /** the first "# " heading, else the file name */
  title!: string;
  /** 0 = docs/README.md, 1 = a chapter, 2 = a page of a chapter, ... */
  depth!: number;
  /** path relative to docs/, e.g. "02-installation/01-install.md" */
  file!: string;
}

/** Every page in reading order (depth first, by name, README.md first). */
export class InfoIndex {
  entries!: InfoEntry[];
  /** where the files are, for "read them without the app" hints */
  root!: string;
}

export class InfoPage {
  slug!: string;
  title!: string;
  file!: string;
  /** the file's Markdown, unchanged */
  markdown!: string;
  /** the pages before and after in reading order */
  prev!: InfoEntry | null;
  next!: InfoEntry | null;
  /** the chapters above this page, outermost first (no docs/README.md) */
  trail!: InfoEntry[];
}

export class InfoSearchHit {
  slug!: string;
  title!: string;
  file!: string;
  /** the first line that matches, as plain text */
  snippet!: string;
}

export class InfoSearchResult {
  query!: string;
  hits!: InfoSearchHit[];
}

export class InfoPageQuery {
  /** the page's slug; empty or missing = docs/README.md */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;
}

export class InfoSearchQuery {
  /** at least 2 characters, case-insensitive, over titles and text */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}
