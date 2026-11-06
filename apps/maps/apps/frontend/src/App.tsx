import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteRegion,
  fetchRegions,
  fetchStatus,
  formatBuild,
  formatBytes,
  THEMES,
  type Bbox,
  type Job,
  type PlaceCandidate,
  type Poi,
  type Region,
  type Status,
  type Theme,
} from "./api";
import { AddRegionDialog } from "./AddRegionDialog";
import { JobView } from "./JobView";
import { MapView, type Cursor, type RegionFocus } from "./MapView";
import { PoiDialog, type PoiDraft } from "./PoiDialog";
import { SetupGate } from "./SetupGate";
import { useJob } from "./useJob";
import { usePois } from "./usePois";

const THEME_KEY = "offline-maps:theme";

export function App() {
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme | null) ?? "light",
  );
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<PlaceCandidate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Every region renders at once, so the sidebar only frames one — it does not
  // select one. The timestamp lets the same row be clicked twice.
  const [regionFocus, setRegionFocus] = useState<RegionFocus | null>(null);

  // --- points of interest ---
  const pois = usePois();
  const [bounds, setBounds] = useState<Bbox | null>(null);
  const [poiDraft, setPoiDraft] = useState<PoiDraft | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [poiFocus, setPoiFocus] = useState<{ lat: number; lon: number } | null>(null);
  const [pendingPoiDelete, setPendingPoiDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextRegions, nextStatus] = await Promise.all([fetchRegions(), fetchStatus()]);
    setRegions(nextRegions);
    setStatus(nextStatus);
    return nextRegions;
  }, []);

  const onJobFinished = useCallback(
    (job: Job) => {
      void refresh().then((next) => {
        // Jump to whatever was just downloaded.
        if (job.type === "download" && job.state === "done" && job.region) {
          const added = next.find((r) => r.name === job.region?.name);
          if (added) setRegionFocus({ bbox: added.bbox, at: Date.now() });
          setAdding(false);
          setPreview(null);
        }
      });
    },
    [refresh],
  );

  const { job, track } = useJob(onJobFinished);

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme =
      theme === "dark" || theme === "black" ? "dark" : "light";
  }, [theme]);

  async function remove(name: string) {
    setPendingDelete(null);
    try {
      await deleteRegion(name);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // POIs are global, so the sidebar shows the ones inside the current viewport.
  const visiblePois = useMemo(() => {
    if (!bounds) return pois.pois;
    const [minLon, minLat, maxLon, maxLat] = bounds;
    return pois.pois.filter(
      (p) => p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon,
    );
  }, [pois.pois, bounds]);

  const onPoiCreate = useCallback((lat: number, lon: number) => {
    setPoiDraft({ kind: "create", lat, lon });
  }, []);

  const onPoiMove = useCallback(
    (id: string, lat: number, lon: number) => {
      void pois.update(id, { lat, lon });
    },
    [pois],
  );

  const onPoiSelect = useCallback((id: string) => {
    setSelectedPoi(id);
  }, []);

  const openPoi = useCallback((poi: Poi) => {
    setSelectedPoi(poi.id);
    setPoiFocus({ lat: poi.lat, lon: poi.lon });
    setPoiDraft({ kind: "edit", poi });
  }, []);

  // Clicking a marker opens its editor; the dialog is the only place to edit.
  useEffect(() => {
    if (!selectedPoi || poiDraft) return;
    const poi = pois.pois.find((p) => p.id === selectedPoi);
    if (poi) setPoiDraft({ kind: "edit", poi });
  }, [selectedPoi, poiDraft, pois.pois]);

  if (error) {
    return (
      <Empty title="Backend unreachable">
        <p>{error}</p>
        <p>
          Start it with <code>npm run dev</code>.
        </p>
      </Empty>
    );
  }

  if (!regions || !status) return <Empty title="Loading…" />;

  if (!status.ready) {
    return <SetupGate status={status} job={job} onJobStarted={track} />;
  }

  const dialog = adding ? (
    <AddRegionDialog
      job={job}
      onJobStarted={track}
      onJobDismissed={() => track(null)}
      onPreview={setPreview}
      onClose={() => {
        setAdding(false);
        setPreview(null);
      }}
    />
  ) : null;

  if (regions.length === 0) {
    return (
      <>
        <Empty title="No regions yet">
          <p>Download a city, state or country to start exploring offline.</p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => setAdding(true)}>
              Add region
            </button>
          </div>
        </Empty>
        {dialog}
      </>
    );
  }

  const running = job && job.state !== "done" && job.state !== "cancelled" && job.state !== "failed";

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-row">
            <h1>Offline Maps</h1>
            <button type="button" className="icon" onClick={() => setAdding(true)} title="Add region">
              +
            </button>
          </div>
          <p className="muted">
            {regions.length} region{regions.length === 1 ? "" : "s"} on disk, all shown
          </p>
        </header>

        <nav className="regions">
          {regions.map((r) => (
            <div key={r.name} className="region">
              <button
                type="button"
                className="region-main"
                title={`Zoom to ${r.label}`}
                onClick={() => setRegionFocus({ bbox: r.bbox, at: Date.now() })}
              >
                <span className="region-label">{r.label}</span>
                <span className="muted small">
                  {formatBytes(r.bytes)} · z{r.minzoom}–{r.maxzoom} · {formatBuild(r.build)}
                </span>
              </button>

              <a
                className="region-download"
                href={`/pmtiles/${r.name}.pmtiles`}
                download
                title={`Download ${r.name}.pmtiles`}
                aria-label={`Download ${r.label} as PMTiles`}
              >
                ⤓
              </a>

              {pendingDelete === r.name ? (
                <span className="confirm">
                  <button type="button" className="danger small" onClick={() => void remove(r.name)}>
                    Delete
                  </button>
                  <button type="button" className="small" onClick={() => setPendingDelete(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="icon subtle"
                  title={`Delete ${r.name}`}
                  aria-label={`Delete ${r.label}`}
                  onClick={() => setPendingDelete(r.name)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </nav>

        {running && !adding && (
          <button type="button" className="activity" onClick={() => setAdding(true)}>
            <JobView job={job} />
          </button>
        )}

        <section className="pois">
          <h2 className="section-head">
            Points of interest
            <span className="muted small">
              {visiblePois.length}
              {pois.pois.length !== visiblePois.length && ` of ${pois.pois.length}`}
            </span>
          </h2>

          {pois.error && (
            <p className="error small" onClick={pois.dismissError}>
              {pois.error}
            </p>
          )}

          {visiblePois.length === 0 ? (
            <p className="muted small">
              {pois.pois.length === 0
                ? "Right-click the map (or long-press on touch) to add one."
                : "None in view — pan or zoom out."}
            </p>
          ) : (
            <ul className="poi-list">
              {visiblePois.map((p) => (
                <li key={p.id} className={p.id === selectedPoi ? "poi active" : "poi"}>
                  <button type="button" className="poi-main" onClick={() => openPoi(p)}>
                    <span className="poi-icon" aria-hidden="true">
                      {p.emoji}
                    </span>
                    <span className="poi-text">
                      <span className="poi-name">{p.name}</span>
                      <span className="muted small tabular">
                        {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                      </span>
                    </span>
                  </button>

                  {pendingPoiDelete === p.id ? (
                    <span className="confirm">
                      <button
                        type="button"
                        className="danger small"
                        onClick={() => {
                          setPendingPoiDelete(null);
                          void pois.remove(p.id);
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="small"
                        onClick={() => setPendingPoiDelete(null)}
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="icon subtle"
                      title={`Delete ${p.name}`}
                      aria-label={`Delete ${p.name}`}
                      onClick={() => setPendingPoiDelete(p.id)}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="controls">
          <label className="field">
            <span className="muted small">Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      <main className="viewport">
        <MapView
          regions={regions}
          theme={theme}
          preview={preview?.preview}
          regionFocus={regionFocus}
          onCursor={setCursor}
          onBounds={setBounds}
          pois={pois.pois}
          selectedPoiId={selectedPoi}
          focus={poiFocus}
          onPoiCreate={onPoiCreate}
          onPoiMove={onPoiMove}
          onPoiSelect={onPoiSelect}
        />
        <footer className="status">
          <span>
            {preview
              ? preview.label
              : `${regions.length} region${regions.length === 1 ? "" : "s"}`}
          </span>
          {cursor && (
            <>
              <span className="muted">z{cursor.zoom.toFixed(1)}</span>
              <span className="muted">
                {cursor.lat.toFixed(5)}, {cursor.lon.toFixed(5)}
              </span>
            </>
          )}
        </footer>
      </main>

      {dialog}
      {poiDraft && (
        <PoiDialog
          draft={poiDraft}
          onSave={(body) =>
            poiDraft.kind === "edit" ? pois.update(poiDraft.poi.id, body) : pois.create(body)
          }
          onDelete={
            poiDraft.kind === "edit" ? () => pois.remove(poiDraft.poi.id) : undefined
          }
          onClose={() => {
            setPoiDraft(null);
            setSelectedPoi(null);
            setPoiFocus(null);
          }}
        />
      )}
    </div>
  );
}

function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}
