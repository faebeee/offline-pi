import { useEffect, useRef, useState } from "react";
import {
  cancelJob,
  confirmDownload,
  DEFAULT_MAXZOOM,
  formatBytes,
  searchPlaces,
  startDownload,
  type Job,
  type PlaceCandidate,
} from "./api";
import { JobView } from "./JobView";

const ZOOMS = [10, 11, 12, 13, 14, 15];

const ZOOM_HINT: Record<number, string> = {
  10: "towns and main roads",
  11: "street network",
  12: "minor streets",
  13: "street detail",
  14: "buildings",
  15: "buildings, house numbers",
};

type Props = {
  job: Job | null;
  onJobStarted: (job: Job) => void;
  onJobDismissed: () => void;
  onPreview: (place: PlaceCandidate | null) => void;
  onClose: () => void;
};

/**
 * Search a place, measure what it would cost, download it. The estimate step
 * is a real `pmtiles extract --dry-run`, so the size shown is the size you get.
 */
export function AddRegionDialog({ job, onJobStarted, onJobDismissed, onPreview, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [maxzoom, setMaxzoom] = useState(DEFAULT_MAXZOOM);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => () => onPreview(null), [onPreview]);

  // Debounced search; an in-flight request is abandoned when you keep typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setError(null);
      searchPlaces(q, controller.signal)
        .then(setResults)
        .catch((err: Error) => {
          if (err.name !== "AbortError") setError(err.message);
        })
        .finally(() => setSearching(false));
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pick(place: PlaceCandidate) {
    setSelected(place);
    setName(place.name);
    onPreview(place);
  }

  function back() {
    setSelected(null);
    onPreview(null);
  }

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const estimate = async () => {
    if (!selected) return;
    const started = await act(() =>
      startDownload({ placeId: selected.id, name: name.trim() || undefined, maxzoom }),
    );
    if (started) onJobStarted(started);
  };

  const active = job && job.type === "download" && job.state !== "done" && job.state !== "cancelled";

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Add region">
        <header className="modal-head">
          <h2>Add region</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          {active ? (
            <ActiveJob
              job={job}
              busy={busy}
              error={error}
              onConfirm={() => act(() => confirmDownload(job.id))}
              onCancel={() => act(() => cancelJob(job.id))}
              onDismiss={onJobDismissed}
            />
          ) : selected ? (
            <>
              <button type="button" className="back" onClick={back}>
                ← {selected.label}
              </button>
              <p className="muted small">
                {selected.detail} · {selected.span} · {selected.source}
              </p>

              <label className="field">
                <span className="muted small">Region id</span>
                <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
              </label>

              <label className="field">
                <span className="muted small">Detail level</span>
                <select value={maxzoom} onChange={(e) => setMaxzoom(Number(e.target.value))}>
                  {ZOOMS.map((z) => (
                    <option key={z} value={z}>
                      zoom {z} — {ZOOM_HINT[z]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">Each level down roughly halves the download.</p>

              {error && <p className="error small">{error}</p>}

              <div className="modal-actions">
                <button type="button" className="primary" onClick={estimate} disabled={busy}>
                  {busy ? "Measuring…" : "Check size"}
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                ref={inputRef}
                className="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="City, state or country — e.g. berlin"
                spellCheck={false}
              />

              {error && <p className="error small">{error}</p>}
              {searching && <p className="muted small">Searching…</p>}
              {results?.length === 0 && !searching && (
                <p className="muted small">Nothing found for “{query}”.</p>
              )}

              <ul className="results">
                {results?.map((place) => (
                  <li key={place.id}>
                    <button type="button" className="result" onClick={() => pick(place)}>
                      <span>{place.label}</span>
                      <span className="muted small">
                        {place.detail} · {place.span}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveJob({
  job,
  busy,
  error,
  onConfirm,
  onCancel,
  onDismiss,
}: {
  job: Job;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const { estimate } = job;

  return (
    <>
      <p className="region-label">{job.region?.label}</p>
      <p className="muted small">
        {job.region?.name} · z{job.region?.minzoom}–{job.region?.maxzoom}
      </p>

      {job.state === "awaiting-confirmation" && estimate ? (
        <>
          <dl className="estimate">
            <div>
              <dt className="muted small">Archive</dt>
              <dd>{formatBytes(estimate.archiveBytes)}</dd>
            </div>
            <div>
              <dt className="muted small">To download</dt>
              <dd>{formatBytes(estimate.transferBytes)}</dd>
            </div>
            <div>
              <dt className="muted small">Planet build</dt>
              <dd className="tabular">{estimate.build}</dd>
            </div>
          </dl>
          {estimate.diskWarning && <p className="warn small">{estimate.diskWarning}</p>}
          {estimate.archiveBytes > 2e9 && (
            <p className="warn small">That is large — a lower detail level shrinks it fast.</p>
          )}
        </>
      ) : (
        <JobView job={job} />
      )}

      {job.state === "failed" && <p className="error small">{job.error}</p>}
      {error && <p className="error small">{error}</p>}

      <div className="modal-actions">
        {job.state === "awaiting-confirmation" && (
          <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
            Download
          </button>
        )}
        {job.state === "failed" ? (
          <button type="button" onClick={onDismiss}>
            Start over
          </button>
        ) : (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </>
  );
}
