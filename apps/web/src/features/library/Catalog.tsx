import {
  ApiError,
  getLibraryCatalogQueryKey,
  getLibrarySyncQueryKey,
  librarySelect,
  useLibraryCatalog,
  type CatalogBook,
  type LibraryCatalog,
} from "@outpost/api-client";
import { bytes, toast } from "@outpost/ui/outpost.js";
import type { StatusState } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useStripLink } from "../../app/strip";
import { Badge, Banner, HoldButton, Icon } from "../../ui/outpost";
import { isRunning, useModule } from "../modules/useModules";
import { SyncStatus, useStartSync, useSync } from "./SyncStatus";
import "./library.css";

const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

const STATE: Record<CatalogBook["state"], { tone: StatusState; label: string } | null> = {
  installed: { tone: "ok", label: "Installed" },
  downloading: { tone: "info", label: "Downloading" },
  queued: { tone: "info", label: "Queued" },
  missing: { tone: "cau", label: "Not downloaded" },
  available: null,
};

/** The offered books, refreshed while a sync runs (states change as books finish). */
export function useCatalog(syncing: boolean) {
  const running = isRunning(useModule("knowledge"));
  return useLibraryCatalog({ query: { enabled: running, refetchInterval: syncing ? 5_000 : false } });
}

/** Context line: "3 OF 17 BOOKS SELECTED · 120 GB FREE". */
export function CatalogContext() {
  const sync = useSync();
  const { data } = useCatalog(sync?.state === "running");
  const books = data?.groups.flatMap((g) => g.books) ?? [];
  const selected = books.filter((b) => b.selected).length;
  return (
    <>
      <span>Kiwix · downloads to this box</span>
      <span>
        {data
          ? [`${selected} of ${books.length} selected`, data.freeBytes != null ? `${bytes(data.freeBytes)} free` : ""]
              .filter(Boolean)
              .join(" · ")
          : "Loading"}
      </span>
    </>
  );
}

/**
 * Choose which books this box keeps: tick books to download them, untick
 * installed ones to delete them, then apply. Nothing downloads before that.
 */
export function Catalog() {
  const qc = useQueryClient();
  const sync = useSync();
  const { data, error, refetch, isFetching } = useCatalog(sync?.state === "running");
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const updates = useStartSync();

  useStripLink(
    error && !data ? "crit" : data ? "ok" : "cau",
    error && !data ? "LOCAL · NO LINK" : data ? "LOCAL · CATALOG" : "LOCAL · LOADING",
  );

  const books = useMemo(() => data?.groups.flatMap((g) => g.books) ?? [], [data]);
  const saved = useMemo(() => new Set(books.filter((b) => b.selected).map((b) => b.key)), [books]);
  const chosen = draft ?? saved;

  // a book added by name shows up in "Other books" once the server knows it
  useEffect(() => {
    if (added.length && books.length) setAdded((a) => a.filter((k) => !books.some((b) => b.key === k)));
  }, [books, added.length]);

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
  };

  const byKey = new Map(books.map((b) => [b.key, b]));
  const download = [...chosen].filter((k) => byKey.get(k)?.state !== "installed");
  const remove = books.filter((b) => b.state === "installed" && !chosen.has(b.key));
  const downloadBytes = download.reduce((s, k) => s + (byKey.get(k)?.size ?? 0), 0);
  const removeBytes = remove.reduce((s, b) => s + (b.size ?? 0), 0);
  const unknownSize = download.some((k) => byKey.get(k)?.size == null);
  const changed = chosen.size !== saved.size || [...chosen].some((k) => !saved.has(k));
  const tooBig = data?.freeBytes != null && downloadBytes > data.freeBytes + removeBytes;

  const apply = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const next = await librarySelect({ keys: [...chosen] });
      qc.setQueryData<LibraryCatalog>(getLibraryCatalogQueryKey(), next);
      void qc.invalidateQueries({ queryKey: getLibrarySyncQueryKey() });
      setDraft(null);
      setAdded([]);
      toast(
        remove.length && download.length
          ? "Selection saved. Books removed, downloads started."
          : remove.length
            ? "Selection saved. Books removed."
            : "Selection saved. Downloads started.",
      );
    } catch (err) {
      setFailure(err instanceof ApiError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <Banner
        tone="crit"
        title="Can't read the book catalog"
        action={
          <button type="button" className="btn btn-crit" disabled={isFetching} onClick={() => void refetch()}>
            <Icon name="refresh" />
            Retry
          </button>
        }
      >
        {error.message}
      </Banner>
    );
  }
  if (!data) return <div className="body-sm fg3">Loading the catalog…</div>;

  // books added by name, not saved yet
  const pending: CatalogBook[] = added
    .filter((k) => !byKey.has(k))
    .map((k) => ({ key: k, title: k, description: "Added by its Kiwix name.", size: null, language: null, selected: false, state: "available" }));
  const groups = pending.length
    ? (() => {
        const other = data.groups.find((g) => g.id === "other");
        const rest = data.groups.filter((g) => g.id !== "other");
        return [...rest, { id: "other", label: "Other books", books: [...(other?.books ?? []), ...pending] }];
      })()
    : data.groups;

  return (
    <>
      <Banner tone="info" title="Nothing downloads until you choose">
        Tick the books this box should keep and apply. Downloads need an internet connection and run in the background;
        each book can be read as soon as it is complete.
      </Banner>

      <SyncStatus sync={sync} />

      {groups.map((g) => (
        <section key={g.id} className="lib-section" aria-labelledby={`lib-g-${g.id}`}>
          <div className="lib-section-head">
            <h2 className="h2" id={`lib-g-${g.id}`}>
              {g.label}
            </h2>
          </div>
          <ul className="list lib-list">
            {g.books.map((b) => (
              <BookRow key={b.key} book={b} checked={chosen.has(b.key)} onToggle={() => toggle(b.key)} />
            ))}
          </ul>
        </section>
      ))}

      <AddByName
        known={(k) => byKey.has(k) || added.includes(k)}
        onAdd={(k) => {
          setAdded((a) => [...a, k]);
          setDraft(new Set([...chosen, k]));
        }}
      />

      <div className="card lib-apply" role="region" aria-label="Apply selection">
        <div className="lib-apply-text">
          <span className="body-sm">
            {changed
              ? [
                  download.length
                    ? `Download ${download.length} ${download.length === 1 ? "book" : "books"} · ${unknownSize ? "at least " : "about "}${bytes(downloadBytes)}`
                    : "",
                  remove.length ? `Delete ${remove.length} ${remove.length === 1 ? "book" : "books"} · ${bytes(removeBytes)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || "No change to what is on disk"
              : "No changes"}
          </span>
          {data.freeBytes != null && <span className="body-sm fg3">{bytes(data.freeBytes)} free on the library disk</span>}
        </div>
        <div className="lib-apply-actions">
          <button type="button" className="btn btn-ghost" disabled={!changed || busy} onClick={() => setDraft(null)}>
            Reset
          </button>
          {remove.length ? (
            <HoldButton
              label={`Hold to delete ${remove.length} and apply`}
              onConfirm={() => void apply()}
              disabled={!changed || busy}
              className="btn-crit"
            />
          ) : (
            <button type="button" className="btn btn-primary" disabled={!changed || busy} onClick={() => void apply()}>
              <Icon name="download" />
              Apply
            </button>
          )}
        </div>
        {tooBig && (
          <Banner tone="cau" title="Probably not enough space">
            The selected downloads need about {bytes(downloadBytes)}, but only {bytes(data.freeBytes)} are free. Books
            that don't fit are skipped.
          </Banner>
        )}
        {failure && (
          <Banner tone="crit" title="The selection wasn't applied">
            {failure}
          </Banner>
        )}
      </div>

      <div className="lib-foot body-sm fg3">
        <Link to="/library">Back to the library</Link>
        {saved.size > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={updates.busy || sync?.state === "running"}
            onClick={() => void updates.start(true)}
            title="Downloads newer versions of installed books; the old file is replaced once the new one is complete"
          >
            <Icon name="refresh" />
            Check for newer versions
          </button>
        )}
        {updates.error && <span>{updates.error}</span>}
      </div>
    </>
  );
}

function BookRow({ book, checked, onToggle }: { book: CatalogBook; checked: boolean; onToggle: () => void }) {
  const state = STATE[book.state];
  const id = `lib-b-${book.key}`;
  const deleting = book.state === "installed" && !checked;
  return (
    <li>
      <label className="row lib-pick" htmlFor={id} title={book.key}>
        <input id={id} type="checkbox" checked={checked} onChange={onToggle} />
        <span className="row-main">
          <span className="row-title">{book.title}</span>
          <span className="lib-pick-desc body-sm fg2">{book.description}</span>
          <span className="row-meta">
            {[book.language ? book.language.toUpperCase() : "", book.key].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="lib-pick-side">
          {deleting ? (
            <Badge state="crit" className="badge-sm">
              Will be deleted
            </Badge>
          ) : (
            state && (
              <Badge state={state.tone} className="badge-sm">
                {state.label}
              </Badge>
            )
          )}
          <span className="row-value">{book.size ? `${book.state === "installed" ? "" : "~"}${bytes(book.size)}` : "Size ?"}</span>
        </span>
      </label>
    </li>
  );
}

function AddByName({ known, onAdd }: { known: (key: string) => boolean; onAdd: (key: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim().replace(/\.zim$/, "").replace(/_\d{4}-\d{2}(-\d{2})?[a-z]?$/, "");
    if (!KEY.test(key)) return setError("Use the file name from download.kiwix.org, e.g. wikipedia_de_all_nopic.");
    if (known(key)) return setError("That book is already in the list.");
    setError(null);
    setValue("");
    onAdd(key);
  };
  return (
    <form className="lib-search card" onSubmit={submit}>
      <div className="lib-search-row">
        <div className="field">
          <label className="label" htmlFor="lib-add">
            Another book by its Kiwix name
          </label>
          <input
            className="input"
            id="lib-add"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. wikipedia_de_all_nopic"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button className="btn" type="submit" disabled={!value.trim()}>
          <Icon name="plus" />
          Add
        </button>
      </div>
      <p className="help">
        {error ?? (
          <>
            Any file from <span className="mono">download.kiwix.org/zim/</span>, without the date and <span className="mono">.zim</span>.
            Its size is known once the download starts.
          </>
        )}
      </p>
    </form>
  );
}
