import { useEffect, useRef, useState } from "react";
import { bytes } from "./outpost-ui/outpost.js";
import {
  cancelJob,
  confirmDownload,
  DEFAULT_MAXZOOM,
  formatBuild,
  searchPlaces,
  startDownload,
  type Job,
  type PlaceCandidate,
} from "./api";
import { JobView } from "./JobView";
import { Badge, Banner, Icon } from "./ui";

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
 * Panel view: search a place, measure what it would cost, download it. The
 * estimate step is a real `pmtiles extract --dry-run`, so the size shown is
 * the size you get.
 */
export function AddRegion({ job, onJobStarted, onJobDismissed, onPreview, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [maxzoom, setMaxzoom] = useState(DEFAULT_MAXZOOM);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const active =
    job && job.type === "download" && job.state !== "done" && job.state !== "cancelled";

  const heading = active ? "Download" : selected ? "Detail level" : "Add region";
  const onBack = active ? onClose : selected ? back : onClose;

  return (
    <>
      <div className="map-panel-head">
        <button
          type="button"
          className="btn btn-icon"
          onClick={onBack}
          aria-label={selected && !active ? "Back to search results" : "Back to regions"}
        >
          <Icon name="back" />
        </button>
        <div className="map-panel-title">
          <h2 className="h2">{heading}</h2>
        </div>
      </div>

      <div className="map-panel-body">
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
            <div className="card brackets">
              <span className="label">Selected · outlined on map</span>
              <span className="row-title">{selected.label}</span>
              <span className="row-meta">
                {selected.detail} · {selected.span} · {selected.source}
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor="region-id">
                Region id
              </label>
              <input
                id="region-id"
                className="input mono"
                value={name}
                onChange={(e) => setName(e.target.value)}
                spellCheck={false}
                aria-describedby="region-id-help"
              />
              <span id="region-id-help" className="help">
                Used in file names and URLs.
              </span>
            </div>

            <div className="field">
              <label className="label" htmlFor="region-zoom">
                Detail level
              </label>
              <select
                id="region-zoom"
                className="select"
                value={maxzoom}
                onChange={(e) => setMaxzoom(Number(e.target.value))}
                aria-describedby="region-zoom-help"
              >
                {ZOOMS.map((z) => (
                  <option key={z} value={z}>
                    Z{z} · {ZOOM_HINT[z]}
                  </option>
                ))}
              </select>
              <span id="region-zoom-help" className="help">
                Each level down roughly halves the download.
              </span>
            </div>

            {error && (
              <Banner tone="crit" title="Could not measure the region">
                {error}
              </Banner>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={estimate}
              disabled={busy}
            >
              {busy ? "Measuring" : "Check size"}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label className="label" htmlFor="place-search">
                City, state or country
              </label>
              <div className="search">
                <Icon name="search" />
                <input
                  id="place-search"
                  ref={inputRef}
                  className="input"
                  type="search"
                  value={query}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Berlin"
                  spellCheck={false}
                />
              </div>
              <span className="help">Searching needs an internet connection.</span>
            </div>

            {error && (
              <Banner tone="crit" title="Search failed">
                {error} Check the internet connection and try again.
              </Banner>
            )}
            <div aria-live="polite" className="label">
              {searching
                ? "Searching"
                : results
                  ? `${results.length} result${results.length === 1 ? "" : "s"}`
                  : ""}
            </div>

            {results?.length === 0 && !searching && (
              <div className="empty">
                <Icon name="search" />
                <p className="empty-title">No match</p>
                <p>Nothing found for “{query.trim()}”. Try a larger area or another spelling.</p>
              </div>
            )}

            {results && results.length > 0 && (
              <ul className="list">
                {results.map((place) => (
                  <li key={place.id}>
                    <button type="button" className="row" onClick={() => pick(place)}>
                      <span className="row-main">
                        <span className="row-title">{place.label}</span>
                        <span className="row-meta">
                          {place.detail} · {place.span}
                        </span>
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
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
  const awaiting = job.state === "awaiting-confirmation";

  return (
    <>
      <div className="card brackets">
        <div className="card-head">
          <span className="label">Region</span>
          <JobBadge job={job} />
        </div>
        <span className="row-title">{job.region?.label}</span>
        <span className="row-meta">
          {job.region?.name} · Z{job.region?.minzoom}–{job.region?.maxzoom}
        </span>
      </div>

      {awaiting && estimate ? (
        <>
          <div className="card">
            <span className="label">Estimate</span>
            <dl className="kv">
              <dt>Archive</dt>
              <dd>{bytes(estimate.archiveBytes)}</dd>
              <dt>To download</dt>
              <dd>{bytes(estimate.transferBytes)}</dd>
              <dt>Planet build</dt>
              <dd>{formatBuild(estimate.build)}</dd>
            </dl>
          </div>
          {estimate.diskWarning && (
            <Banner tone="cau" title="Low disk space">
              {estimate.diskWarning}
            </Banner>
          )}
          {estimate.archiveBytes > 2e9 && (
            <Banner tone="info" title="Large download">
              A lower detail level shrinks it fast.
            </Banner>
          )}
        </>
      ) : (
        <JobView job={job} />
      )}

      {job.state === "failed" && (
        <Banner tone="crit" title="Download failed">
          {job.error} Start over to try again.
        </Banner>
      )}
      {error && (
        <Banner tone="crit" title="Request failed">
          {error}
        </Banner>
      )}

      <div className="map-panel-actions">
        {awaiting && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={onConfirm}
            disabled={busy}
          >
            <Icon name="download" />
            Download {estimate ? bytes(estimate.transferBytes) : ""}
          </button>
        )}
        {job.state === "failed" ? (
          <button type="button" className="btn btn-block" onClick={onDismiss}>
            Start over
          </button>
        ) : (
          <button type="button" className="btn btn-block" onClick={onCancel} disabled={busy}>
            {awaiting ? "Decline" : "Cancel download"}
          </button>
        )}
      </div>
    </>
  );
}

export function JobBadge({ job }: { job: Job }) {
  switch (job.state) {
    case "estimating":
      return <Badge state="info">Measuring</Badge>;
    case "awaiting-confirmation":
      return <Badge state="cau">Confirm</Badge>;
    case "running":
      return <Badge state="info">Downloading</Badge>;
    case "done":
      return <Badge state="ok">Cached</Badge>;
    case "failed":
      return <Badge state="crit">Failed</Badge>;
    case "cancelled":
      return <Badge state="off">Cancelled</Badge>;
  }
}
