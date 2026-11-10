import type { Book } from "@outpost/api-client";
import { bytes } from "@outpost/ui/outpost.js";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useStripLink } from "../../app/strip";
import { Badge, Banner, Icon } from "../../ui/outpost";
import { KIWIX_ROOT, monogramFor, searchScopes, useBooks } from "./books";
import { SearchResults } from "./SearchResults";
import { SyncStatus, syncBadge, useSync } from "./SyncStatus";
import "./library.css";

export type LibrarySearch = { q?: string; scope?: string; start?: number };

/** Context line: "3 BOOKS · 92.4 GB · NEWEST 2025-11". */
export function LibraryContext() {
  const { data, error } = useBooks();
  const books = data?.books;
  let line = "Loading catalog";
  if (error && !books) line = "Catalog unavailable";
  else if (books) {
    const total = books.reduce((s, b) => s + (b.size ?? 0), 0);
    const newest = books
      .map((b) => b.date)
      .filter(Boolean)
      .sort()
      .pop();
    line = [`${books.length} ${books.length === 1 ? "book" : "books"}`, total ? bytes(total) : "", newest ? `Newest ${newest}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return (
    <>
      <span>Kiwix · served from this box</span>
      <span>{line}</span>
    </>
  );
}

/** Library home: search form, then either the book list or the results. */
export function Library({ search }: { search: LibrarySearch }) {
  const { data, error, refetch, isFetching } = useBooks();
  const books = data?.books;
  const sync = useSync();

  const n = books?.length ?? 0;
  const short = error ? (error.status ? `HTTP ${error.status}` : "NO LINK") : "";
  useStripLink(
    error && !books ? "crit" : books ? "ok" : "cau",
    error && !books ? `LOCAL · ${short}` : books ? `LOCAL · ${n} ${n === 1 ? "BOOK" : "BOOKS"}` : "LOCAL · LOADING",
  );

  return (
    <>
      <Banner tone="info" title="Works offline">
        Every book here is stored on this box. Reading and searching need no internet connection.
      </Banner>

      {error && (
        <Banner
          tone="crit"
          title="Can't read the library catalog"
          action={
            <button type="button" className="btn btn-crit" disabled={isFetching} onClick={() => void refetch()}>
              <Icon name="refresh" />
              Retry
            </button>
          }
        >
          {error.message}. If it keeps failing, check the container with <code>./manage.sh logs</code>.
        </Banner>
      )}

      <SyncStatus sync={sync} />

      <SearchForm books={books} search={search} />

      {search.q ? (
        <SearchResults books={books} search={search} />
      ) : (
        books && <BookList books={books} syncing={sync?.state === "running"} badge={syncBadge(sync)} />
      )}

      <div className="lib-foot body-sm fg3">
        <span>Kiwix's own views:</span>
        <a href={`${KIWIX_ROOT}/nojs`}>Simple library list</a>
        <a href={`${KIWIX_ROOT}/catalog/v2/entries?count=-1`}>OPDS catalog</a>
      </div>
    </>
  );
}

function SearchForm({ books, search }: { books: Book[] | undefined; search: LibrarySearch }) {
  const navigate = useNavigate();
  const scopes = searchScopes(books ?? []);
  const all = [...scopes.langs, ...scopes.books];
  const fallback = all[0]?.value ?? "";
  const [q, setQ] = useState(search.q ?? "");
  const [scope, setScope] = useState(search.scope ?? "");
  // follow the URL (back/forward, a pasted link)
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  useEffect(() => setScope(search.scope ?? ""), [search.scope]);

  const current = all.some((s) => s.value === scope) ? scope : fallback;
  const ok = all.length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const pattern = q.trim();
    if (!pattern || !current) return;
    void navigate({ to: "/library", search: { q: pattern, scope: current } });
  };

  return (
    <form className="lib-search card" role="search" onSubmit={submit}>
      <div className="lib-search-row">
        <div className="field">
          <label className="label" htmlFor="lib-q">
            Full-text search
          </label>
          <div className="search">
            <Icon name="search" />
            <input
              className="input"
              id="lib-q"
              type="search"
              autoComplete="off"
              required
              placeholder="e.g. tourniquet, water purification"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="badge badge-sm">LOCAL</span>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="lib-scope">
            Search in
          </label>
          <select
            className="select"
            id="lib-scope"
            disabled={!ok}
            value={current}
            onChange={(e) => setScope(e.target.value)}
          >
            {!books && <option value="">Loading books</option>}
            {books && !ok && <option value="">{books.length ? "No book has a search index" : "No books installed"}</option>}
            {scopes.langs.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            {scopes.books.length > 0 && (
              <optgroup label="One book">
                {scopes.books.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={!ok}>
          <Icon name="search" />
          Search
        </button>
      </div>
      <p className="help">Books in different languages are searched one language at a time.</p>
    </form>
  );
}

function BookList({
  books,
  syncing,
  badge,
}: {
  books: Book[];
  syncing: boolean;
  badge: ReturnType<typeof syncBadge>;
}) {
  return (
    <section className="lib-section" aria-labelledby="lib-books-title">
      <div className="lib-section-head">
        <h2 className="h2" id="lib-books-title">
          Books
        </h2>
        <span className="lib-section-meta">
          {badge && (
            <Badge state={badge.tone} className="badge-sm">
              {badge.label}
            </Badge>
          )}
          <span className="label">{books.length} installed</span>
          <Link to="/library/catalog" className="btn btn-sm">
            <Icon name="download" />
            Choose books
          </Link>
        </span>
      </div>
      {books.length ? (
        <ul className="list lib-list" aria-live="polite">
          {books.map((b) => (
            <li key={b.id}>
              <Link to="/library/read" search={{ url: b.viewerUrl }} className="row has-mono" title={b.summary || undefined}>
                <span className="monogram" aria-hidden="true">
                  {monogramFor(b.title)}
                </span>
                <span className="row-main">
                  <span className="row-title">{b.title}</span>
                  <span className="row-meta">
                    {[
                      b.language ? b.language.toUpperCase() : "",
                      b.articleCount ? `${b.articleCount.toLocaleString("en-US")} articles` : "",
                      b.date,
                      b.fulltext ? "" : "Titles only",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {b.size ? <span className="row-value">{bytes(b.size)}</span> : null}
                <Icon name="chevron" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <Icon name="library" />
          <h3 className="empty-title">{syncing ? "Downloading the first books" : "No books yet"}</h3>
          <p>
            {syncing
              ? "Each book appears here as soon as its download is complete."
              : "Choose which books to download: medical guides, repair manuals, Wikipedia and more. Nothing is downloaded until you do."}
          </p>
          {!syncing && (
            <Link to="/library/catalog" className="btn btn-primary">
              <Icon name="download" />
              Choose books
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
