import {
  getLibraryBooksQueryKey,
  getLibraryCatalogQueryKey,
  getLibrarySyncQueryKey,
  libraryStartSync,
  useLibrarySync,
  type LibrarySync,
} from "@outpost/api-client";
import { ago, bytes } from "@outpost/ui/outpost.js";
import type { StatusState } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useStripItems } from "../../app/strip";
import { isRunning, useModule } from "../modules/useModules";
import { Badge, Banner, Icon, Progress } from "../../ui/outpost";

/**
 * The knowledge container's background sync (the selected books). Polled
 * every few seconds while it runs, rarely otherwise; when a book finishes
 * (or the sync ends) the book list and the catalog are re-read so it shows
 * up right away.
 */
export function useSync() {
  const running = isRunning(useModule("knowledge"));
  const qc = useQueryClient();
  const query = useLibrarySync({
    query: {
      enabled: running,
      refetchInterval: (q) => (q.state.data?.state === "running" ? 3_000 : 30_000),
    },
  });
  const sync = query.data;

  // a finished book: the file changed, or the sync stopped
  const last = useRef<string | null>(null);
  const key = sync ? `${sync.state}:${sync.file ?? ""}` : null;
  useEffect(() => {
    if (key === null) return;
    if (last.current !== null && last.current !== key) {
      void qc.invalidateQueries({ queryKey: getLibraryBooksQueryKey() });
      void qc.invalidateQueries({ queryKey: getLibraryCatalogQueryKey() });
    }
    last.current = key;
  }, [key, qc]);

  return sync;
}

/** Badge state and label for the sync. */
export function syncBadge(sync: LibrarySync | undefined): { tone: StatusState; label: string } | null {
  if (!sync || sync.state === "unknown") return null;
  if (sync.state === "running") return { tone: "info", label: "Syncing" };
  if (sync.result === "problems") return { tone: "cau", label: "Sync problems" };
  if (sync.result === "interrupted") return { tone: "cau", label: "Sync interrupted" };
  return { tone: "ok", label: "Up to date" };
}

const PHASE: Record<string, string> = {
  checking: "Checking which books are missing",
  catalog: "Reading the Kiwix catalog",
  downloading: "Downloading",
};

/** Strip item + the sync card: what is downloading and how far, or how the last sync ended. */
/** Start the sync now (update: also newer versions); re-reads the status. */
export function useStartSync() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (update = false) => {
    setBusy(true);
    setError(null);
    try {
      const next = await libraryStartSync({ update });
      qc.setQueryData(getLibrarySyncQueryKey(), next);
      void qc.invalidateQueries({ queryKey: getLibrarySyncQueryKey() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { start, busy, error };
}

export function SyncStatus({ sync }: { sync: LibrarySync | undefined }) {
  const running = sync?.state === "running";
  const retry = useStartSync();
  useStripItems(
    running
      ? [{ label: "SYNC", value: sync.count ? `${sync.index || 0}/${sync.count}` : "ON" }]
      : [],
  );
  if (!sync || sync.state === "unknown") return null;

  if (running) {
    const ratio = sync.size && sync.downloadedBytes != null ? sync.downloadedBytes / sync.size : null;
    const step = sync.phase ? (PHASE[sync.phase] ?? "Syncing") : "Syncing";
    return (
      <div className="card lib-sync" role="status" aria-live="polite">
        <div className="lib-sync-head">
          <Badge state="info" className="badge-sm">
            Syncing
          </Badge>
          <span className="label">
            {sync.phase === "downloading" && sync.count ? `Book ${sync.index} of ${sync.count}` : step}
          </span>
        </div>
        {sync.phase === "downloading" && sync.file ? (
          <>
            <div className="lib-sync-file mono">{sync.file}</div>
            {ratio !== null && <Progress ratio={Math.min(1, ratio)} />}
            <div className="body-sm fg2">
              {ratio !== null && sync.downloadedBytes != null && sync.size
                ? `About ${bytes(sync.downloadedBytes)} of ${bytes(sync.size)}`
                : sync.size
                  ? bytes(sync.size)
                  : ""}
              {sync.failed ? ` · ${sync.failed} failed so far` : ""}
            </div>
          </>
        ) : (
          <div className="body-sm fg2">{step}…</div>
        )}
        <p className="help">
          Downloading in the background. Each book appears in the list as soon as it is complete; the library stays
          usable meanwhile.
        </p>
      </div>
    );
  }

  if (sync.result === "problems" || sync.result === "interrupted") {
    return (
      <Banner
        tone="cau"
        title={sync.result === "problems" ? "The last sync had problems" : "The last sync was interrupted"}
        action={
          <button type="button" className="btn" disabled={retry.busy} onClick={() => void retry.start()}>
            <Icon name="refresh" />
            Retry
          </button>
        }
      >
        {sync.message ?? ""}
        {sync.updatedAt ? ` (${ago(sync.updatedAt).toLowerCase()})` : ""}
        {retry.error ? ` Retry failed: ${retry.error}` : ""}
      </Banner>
    );
  }
  return null;
}
