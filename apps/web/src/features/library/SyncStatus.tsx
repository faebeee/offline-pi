import { getLibraryBooksQueryKey, useLibrarySync, type LibrarySync } from "@offline-pi/api-client";
import { ago, bytes } from "@offline-pi/ui/outpost.js";
import type { StatusState } from "@offline-pi/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useStripItems } from "../../app/strip";
import { isRunning, useModule } from "../modules/useModules";
import { Badge, Banner, Progress } from "../../ui/outpost";

/**
 * The knowledge container's background sync (books from zims.txt). Polled
 * every few seconds while it runs, rarely otherwise; when a book finishes
 * (or the sync ends) the book list is re-read so it shows up right away.
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
export function SyncStatus({ sync }: { sync: LibrarySync | undefined }) {
  const running = sync?.state === "running";
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
      <Banner tone="cau" title={sync.result === "problems" ? "The last sync had problems" : "The last sync was interrupted"}>
        {sync.message ?? ""} Run <code>./manage.sh knowledge sync</code> on the Pi to retry
        {sync.updatedAt ? ` (${ago(sync.updatedAt).toLowerCase()})` : ""}.
      </Banner>
    );
  }
  return null;
}
