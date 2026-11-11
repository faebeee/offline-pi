import { useInfoIndex, useInfoPage, useInfoSearch, type InfoEntry } from "@outpost/api-client";
import { Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Screen } from "../../app/Screen";
import { Banner, Icon, Illustration } from "../../ui/outpost";
import { Markdown } from "./Markdown";
import "./info.css";

/** The Info module: the Markdown files of docs/, with chapters and search. */
export function InfoScreen({ slug }: { slug: string }) {
  const index = useInfoIndex();
  const page = useInfoPage({ slug });
  const entries = index.data?.entries ?? [];


  // a new page starts at its top, or at the heading in the URL's #hash
  const article = useRef<HTMLElement>(null);
  const loaded = page.data?.slug;
  useEffect(() => {
    if (loaded === undefined) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? document.getElementById(hash) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else article.current?.closest(".content")?.scrollTo({ top: 0 });
  }, [loaded]);

  return (
    <Screen module="info" title={page.data?.title ?? "Info"}>
      <div className="docs">
        <aside className="docs-side" aria-label="Documentation">
          <Toc
            entries={entries}
            current={page.data?.slug ?? slug}
            version={index.data?.version ?? null}
            changelog={index.data?.changelog ?? null}
          />
        </aside>

        <article className="docs-main" ref={article}>
          {page.isError ? (
            <>
              <Illustration name="lost" className="gate-art" />
              <Banner
                tone="info"
                title="This page does not exist"
                action={
                  <Link to="/info/$" params={{ _splat: "" }} className="btn">
                    Contents
                  </Link>
                }
              >
                It may have been moved or renamed. The files are in the project's docs/ folder.
              </Banner>
            </>
          ) : !page.data ? (
            <p className="label">Loading…</p>
          ) : (
            <>
              {page.data.trail.length > 0 && (
                <nav className="docs-trail label" aria-label="Chapter">
                  {page.data.trail.map((t) => (
                    <Link key={t.slug} to="/info/$" params={{ _splat: t.slug }}>
                      {t.title}
                    </Link>
                  ))}
                </nav>
              )}
              <Markdown key={page.data.slug} markdown={page.data.markdown} file={page.data.file} entries={entries} />
              <footer className="docs-foot">
                <span className="docs-path label">
                  <Icon name="manual" />
                  docs/{page.data.file}
                </span>
                <div className="docs-pager">
                  {page.data.prev ? <Pager entry={page.data.prev} dir="prev" /> : <span />}
                  {page.data.next && <Pager entry={page.data.next} dir="next" />}
                </div>
              </footer>
            </>
          )}
        </article>
      </div>
    </Screen>
  );
}

function Pager({ entry, dir }: { entry: InfoEntry; dir: "prev" | "next" }) {
  return (
    <Link to="/info/$" params={{ _splat: entry.slug }} className={`docs-pager-link is-${dir}`}>
      <span className="label">{dir === "prev" ? "Previous" : "Next"}</span>
      <span className="docs-pager-title">{entry.title}</span>
    </Link>
  );
}

/**
 * Chapter navigation plus search. On phones it folds into one line above
 * the page; on wide screens it is a column next to it.
 */
function Toc({
  entries,
  current,
  version,
  changelog,
}: {
  entries: InfoEntry[];
  current: string;
  version: string | null;
  changelog: string | null;
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const searching = q.length >= 2;
  const search = useInfoSearch({ q }, { query: { enabled: searching, placeholderData: (prev) => prev } });
  const [open, setOpen] = useState(false);
  const wide = useWide();

  // a page was chosen: fold the navigation away again (phones)
  useEffect(() => setOpen(false), [current]);

  const currentEntry = entries.find((e) => e.slug === current);

  return (
    <details className="docs-toc" open={wide || open} onToggle={(e) => !wide && setOpen(e.currentTarget.open)}>
      <summary className="docs-toc-summary">
        <Icon name="list" />
        <span>{currentEntry ? currentEntry.title : "Contents"}</span>
        <span className="label">{entries.length} pages</span>
      </summary>

      <div className="docs-toc-body">
        <label className="search docs-search">
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Search the docs"
            aria-label="Search the documentation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        {searching ? (
          <ul className="docs-hits" aria-live="polite">
            {search.data?.hits.length === 0 && <li className="help">Nothing found for “{q}”.</li>}
            {search.data?.hits.map((h) => (
              <li key={h.slug}>
                <Link to="/info/$" params={{ _splat: h.slug }} className="docs-hit" onClick={() => setQuery("")}>
                  <span className="docs-hit-title">{h.title}</span>
                  {h.snippet && <span className="docs-hit-snippet">{h.snippet}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="docs-list">
            {entries.map((e) => (
              <li key={e.slug} className={`docs-item depth-${Math.min(e.depth, 3)}`}>
                <Link
                  to="/info/$"
                  params={{ _splat: e.slug }}
                  // exact: the router would mark every parent chapter (and Start) active too
                  activeOptions={{ exact: true, includeHash: false }}
                  aria-current={e.slug === current ? "page" : undefined}
                  className="docs-link"
                >
                  {e.depth === 0 ? "Start" : e.title}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {version && (
          <p className="docs-version label">
            <span>outpost {version}</span>
            {changelog && (
              <Link to="/info/$" params={{ _splat: changelog }}>
                Changelog
              </Link>
            )}
          </p>
        )}
      </div>
    </details>
  );
}

/** The side column is always there from 900 px (the module nav's rail breakpoint). */
function useWide(): boolean {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}
