import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef } from "react";
import { Screen } from "../app/Screen";
import { bookOfUrl, isReaderUrl, useBooks } from "../features/library/books";
import { Reader } from "../features/library/Reader";
import { ModuleGate } from "../features/modules/ModuleGate";
import { Banner, Icon } from "../ui/outpost";

type Search = { url?: string };

export const Route = createFileRoute("/library/read")({
  // ?url=/svc/library/viewer#<book>/<article>: only kiwix's own pages
  validateSearch: (search: Record<string, unknown>): Search => (isReaderUrl(search.url) ? { url: search.url } : {}),
  component: ReadScreen,
});

/** A book or article in kiwix's viewer, inside the app frame. */
function ReadScreen() {
  const { url } = Route.useSearch();
  const { data } = useBooks();
  const book = url ? bookOfUrl(url, data?.books ?? []) : undefined;
  const frame = useRef<HTMLIFrameElement>(null);

  const actions = (
    <>
      <Link to="/library" className="btn btn-icon" aria-label="Back to the library" title="Library">
        <Icon name="back" />
      </Link>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="btn btn-icon"
          aria-label="Open in a new tab"
          title="Open in a new tab"
          onClick={(e) => {
            // the page the reader is on now, not the one it opened with
            try {
              const live = frame.current?.contentWindow?.location.href;
              if (live && live !== "about:blank") e.currentTarget.href = live;
            } catch {
              // not same-origin (should not happen): keep the original URL
            }
          }}
        >
          <Icon name="external" />
        </a>
      )}
    </>
  );

  return (
    <Screen module="knowledge" title={book?.title ?? "Reader"} actions={actions} bleed={!!url}>
      <ModuleGate id="knowledge">
        {url ? (
          <Reader ref={frame} url={url} title={book?.title ?? "Library reader"} />
        ) : (
          <Banner tone="info" title="Nothing to read" action={<Link to="/library" className="btn">Library</Link>}>
            Pick a book or a search result in the library.
          </Banner>
        )}
      </ModuleGate>
    </Screen>
  );
}
