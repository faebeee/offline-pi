import { useLibraryBooks, type Book } from "@offline-pi/api-client";
import { isRunning, useModule } from "../modules/useModules";

/** kiwix-serve's root under core's passthrough (its own views: nojs list, OPDS). */
export const KIWIX_ROOT = "/svc/library";

/** Installed books, fetched only while the knowledge container runs. */
export function useBooks() {
  const running = isRunning(useModule("knowledge"));
  // refetchOnWindowFocus (main.tsx) re-reads the catalog when the tab comes
  // back into view, so books that finished downloading meanwhile show up
  return useLibraryBooks({ query: { enabled: running, staleTime: 5_000 } });
}

let displayNames: Intl.DisplayNames | null = null;
try {
  displayNames = new Intl.DisplayNames(["en"], { type: "language" });
} catch {
  // no Intl.DisplayNames: show the code
}

/** "eng" -> "English" (or the code in capitals when unknown). */
export function langName(code: string): string {
  try {
    const n = displayNames?.of(code);
    return n && n !== code ? n : code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function monogramFor(title: string): string {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "?";
}

export type Scope = { value: string; label: string };

/**
 * Search scopes. kiwix-serve refuses a multi-book search across languages,
 * so whole-library search is per language (most books first); single books
 * are listed too. Only books with a full-text index count.
 */
export function searchScopes(books: Book[]): { langs: Scope[]; books: Scope[] } {
  const searchable = books.filter((b) => b.fulltext);
  const byLang = new Map<string, number>();
  for (const b of searchable) byLang.set(b.language, (byLang.get(b.language) ?? 0) + 1);
  const langs = [...byLang].sort((x, y) => y[1] - x[1]);
  // "en" and "eng" are different languages to kiwix-serve but share a name
  const names = langs.map(([lang]) => langName(lang));
  return {
    langs: langs.map(([lang, n], i) => {
      const dup = names.indexOf(names[i]!) !== names.lastIndexOf(names[i]!);
      const name = dup ? `${names[i]} (${lang.toUpperCase()})` : names[i];
      return { value: `lang:${lang}`, label: langs.length === 1 ? `All books (${n})` : `All ${name} books (${n})` };
    }),
    books: searchable.length > 1 ? searchable.map((b) => ({ value: `id:${b.id}`, label: b.title })) : [],
  };
}

/** "lang:eng" / "id:<uuid>" -> the search API's scope parameter. */
export function scopeParams(scope: string): { lang: string } | { bookId: string } | null {
  const [kind, value] = scope.split(/:(.*)/s);
  if (!value) return null;
  if (kind === "lang") return { lang: value };
  if (kind === "id") return { bookId: value };
  return null;
}

/** The book a viewer/content URL belongs to (…/viewer#<name>/… or …/content/<name>/…). */
export function bookOfUrl(url: string, books: Book[]): Book | undefined {
  const m = /\/(?:viewer#|content\/)([^/#?]+)/.exec(url);
  const name = m?.[1] ? decodeURIComponent(m[1]) : null;
  return name ? books.find((b) => b.name === name) : undefined;
}

/** Only kiwix's own pages open in the reader frame. */
export function isReaderUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(`${KIWIX_ROOT}/`) && !url.includes("..");
}
