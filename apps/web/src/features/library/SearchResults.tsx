import { useLibrarySearch, type Book } from "@outpost/api-client";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Banner, Icon } from "../../ui/outpost";
import { scopeParams, searchScopes } from "./books";
import type { LibrarySearch } from "./Library";

export const PAGE = 25;

/** Full-text hits for ?q=&scope=&start=, paged; each opens in the reader. */
export function SearchResults({ books, search }: { books: Book[] | undefined; search: LibrarySearch }) {
  const q = search.q ?? "";
  const start = Math.max(0, search.start ?? 0);
  const scopes = searchScopes(books ?? []);
  const all = [...scopes.langs, ...scopes.books];
  // a link without (or with an unknown) scope searches the default one
  const scope = all.find((s) => s.value === search.scope) ?? all[0];
  const params = scope ? scopeParams(scope.value) : null;

  const result = useLibrarySearch(
    { q, ...params, start, pageLength: PAGE },
    { query: { enabled: !!q && !!params, placeholderData: keepPreviousData, staleTime: 60_000, retry: false } },
  );
  const data = result.data;

  const clear = (
    <Link to="/library" className="btn">
      <Icon name="back" />
      All books
    </Link>
  );

  let body: React.ReactNode = null;
  if (books && !params) {
    body = <Banner tone="info" title="Nothing to search">No installed book has a full-text index.</Banner>;
  } else if (result.error) {
    body = (
      <Banner
        tone="crit"
        title="Search failed"
        action={
          <button type="button" className="btn btn-crit" onClick={() => void result.refetch()}>
            <Icon name="refresh" />
            Retry
          </button>
        }
      >
        {result.error.message}
      </Banner>
    );
  } else if (!data) {
    body = <p className="label">Searching…</p>;
  } else if (!data.hits.length) {
    body = (
      <div className="empty">
        <Icon name="search" />
        <h3 className="empty-title">No results</h3>
        <p>
          Nothing in {scope?.label ?? "the library"} matches “{q}”. Try other words, or another language or book.
        </p>
      </div>
    );
  } else {
    const last = data.start + data.hits.length;
    body = (
      <>
        <ul className={`list lib-list${result.isPlaceholderData ? " is-loading" : ""}`} aria-busy={result.isFetching}>
          {data.hits.map((h, i) => (
            <li key={`${h.url}-${i}`}>
              <Link to="/library/read" search={{ url: h.viewerUrl }} className="row">
                <span className="row-main">
                  <span className="row-title">{h.title}</span>
                  <span className="row-meta">
                    {[h.book, h.wordCount ? `${h.wordCount.toLocaleString("en-US")} words` : ""].filter(Boolean).join(" · ")}
                  </span>
                  {h.snippet && <span className="lib-snippet">{h.snippet}</span>}
                </span>
                <Icon name="chevron" />
              </Link>
            </li>
          ))}
        </ul>
        {(data.start > 0 || last < data.total) && (
          <nav className="lib-pager" aria-label="Result pages">
            {data.start > 0 ? (
              <Link to="/library" search={{ ...search, start: Math.max(0, data.start - PAGE) || undefined }} className="btn">
                <Icon name="back" />
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="label">
              {data.start + 1}–{last} of {data.total.toLocaleString("en-US")}
            </span>
            {last < data.total ? (
              <Link to="/library" search={{ ...search, start: last }} className="btn">
                Next
                <Icon name="chevron" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </>
    );
  }

  return (
    <section className="lib-section" aria-labelledby="lib-results-title">
      <div className="lib-section-head">
        <div className="lib-section-title">
          <h2 className="h2" id="lib-results-title">
            Results
          </h2>
          <span className="label">
            {data && !result.isPlaceholderData ? `${data.total.toLocaleString("en-US")} for “${q}”` : `“${q}”`}
            {scope ? ` · ${scope.label}` : ""}
          </span>
        </div>
        {clear}
      </div>
      {body}
    </section>
  );
}
