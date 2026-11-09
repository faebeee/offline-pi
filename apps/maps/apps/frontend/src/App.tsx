import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bytes, coords, frame, moduleLabel, toast, type Strip } from "./outpost-ui/outpost.js";
import {
  deleteRegion,
  fetchRegions,
  fetchStatus,
  formatBuild,
  isJobFinished,
  type Bbox,
  type Job,
  type PlaceCandidate,
  type Poi,
  type Region,
  type Status,
} from "./api";
import { AddRegion, JobBadge } from "./AddRegion";
import { JobView } from "./JobView";
import { MapView, type Cursor, type Fix, type RegionFocus } from "./MapView";
import { PoiDialog, type PoiDraft } from "./PoiDialog";
import { SetupGate } from "./SetupGate";
import { Banner, HoldButton, Icon, useTheme } from "./ui";
import { useJob } from "./useJob";
import { usePois } from "./usePois";

/** Side panel next to the map from this width; a bottom sheet below it. */
const WIDE = "(min-width: 720px)";

type PanelView = "regions" | "places" | "add";

export function App() {
  const shell = useRef<HTMLDivElement>(null);
  const [strip, setStrip] = useState<Strip | null>(null);
  const theme = useTheme();

  const [regions, setRegions] = useState<Region[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);
  const [view, setView] = useState<PanelView>("regions");
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia(WIDE).matches);
  const [preview, setPreview] = useState<PlaceCandidate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  // Every region renders at once, so the panel only frames one; it does not
  // select one. The timestamp lets the same row be clicked twice.
  const [regionFocus, setRegionFocus] = useState<RegionFocus | null>(null);

  // --- points of interest ---
  const pois = usePois();
  const [bounds, setBounds] = useState<Bbox | null>(null);
  const [poiDraft, setPoiDraft] = useState<PoiDraft | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [poiFocus, setPoiFocus] = useState<{ lat: number; lon: number } | null>(null);

  // Status strip, module nav and theme toggle from the shared package. Once:
  // the shell below is always rendered, and frame() binds listeners.
  // A ref, not state, guards it: StrictMode re-runs effects before state lands.
  const framed = useRef(false);
  useEffect(() => {
    if (!shell.current || framed.current) return;
    framed.current = true;
    setStrip(frame("maps", shell.current).strip);
  }, []);

  const refresh = useCallback(async () => {
    const [nextRegions, nextStatus] = await Promise.all([fetchRegions(), fetchStatus()]);
    setRegions(nextRegions);
    setStatus(nextStatus);
    setError(null);
    return nextRegions;
  }, []);

  const onJobFinished = useCallback(
    (job: Job) => {
      void refresh().then((next) => {
        // Jump to whatever was just downloaded.
        if (job.type === "download" && job.state === "done" && job.region) {
          const added = next.find((r) => r.name === job.region?.name);
          if (added) setRegionFocus({ bbox: added.bbox, at: Date.now() });
          setView("regions");
          setPreview(null);
          toast(`${job.region.label} cached. It now works offline.`);
        }
      });
    },
    [refresh],
  );

  const { job, track } = useJob(onJobFinished);

  const load = useCallback(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, [refresh]);

  useEffect(load, [load]);

  const running = !!job && job.type === "download" && !isJobFinished(job);
  const totalBytes = regions?.reduce((sum, r) => sum + r.bytes, 0) ?? 0;

  // Status strip: link state plus whatever this module actually knows.
  useEffect(() => {
    if (!strip) return;
    // Link to this app's own data source (the local map server): ok once it
    // answers, cau while the first request is out, crit when it fails.
    if (error) strip.setLink("crit", "LOCAL · NO ANSWER");
    else if (regions) {
      strip.setLink("ok", `LOCAL · ${regions.length} ${regions.length === 1 ? "REGION" : "REGIONS"}`);
    } else strip.setLink("cau", "LOCAL · CONNECTING");
    const items = [];
    if (fix) items.push({ label: "GNSS", value: `±${Math.round(fix.accuracy)} M` });
    if (running && job?.progress) {
      items.push({ label: "DL", value: `${Math.round(job.progress.percent)}%` });
    }
    if (regions?.length) items.push({ label: "DISK", value: bytes(totalBytes) });
    strip.setItems(items);
  }, [strip, error, fix, running, job, regions, totalBytes]);

  async function remove(region: Region) {
    setPendingDelete(null);
    setRegionError(null);
    try {
      await deleteRegion(region.name);
      await refresh();
      toast(`${region.label} deleted. Saved places are kept.`);
    } catch (err) {
      setRegionError((err as Error).message);
    }
  }

  // POIs are global, so the panel shows the ones inside the current viewport.
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

  const closeAdd = useCallback(() => {
    setView("regions");
    setPreview(null);
  }, []);

  // ------------------------------------------------------------- body ---

  let body: React.ReactNode;
  let bleed = false;
  let title = "Offline map";

  if (error && !regions) {
    title = "Not connected";
    body = (
      <Banner
        tone="crit"
        title="Map server unreachable"
        action={
          <button type="button" className="btn" onClick={load}>
            <Icon name="refresh" />
            Retry
          </button>
        }
      >
        {error}. Start the map server with ./start.sh (or npm run dev), then retry.
      </Banner>
    );
  } else if (!regions || !status) {
    body = (
      <div className="empty">
        <Icon name="map" />
        <p className="empty-title">Loading</p>
        <p>Reading the regions stored on this device.</p>
      </div>
    );
  } else if (!status.ready) {
    title = "Setup";
    body = <SetupGate status={status} job={job} onJobStarted={track} />;
  } else {
    bleed = true;
    const showPanel = panelOpen || regions.length === 0;
    const center = bounds
      ? { lat: (bounds[1] + bounds[3]) / 2, lon: (bounds[0] + bounds[2]) / 2 }
      : null;

    body = (
      <div className={`map-stage${showPanel ? " is-open" : ""}`}>
        <aside id="maps-panel" className="map-panel" aria-label="Regions and places" hidden={!showPanel}>
          {view === "add" ? (
            <AddRegion
              job={job}
              onJobStarted={track}
              onJobDismissed={() => track(null)}
              onPreview={setPreview}
              onClose={closeAdd}
            />
          ) : (
            <>
              <div className="map-panel-head is-tabs">
                <div className="tabs" role="tablist" aria-label="Panel">
                  <button
                    type="button"
                    role="tab"
                    className="tab"
                    id="tab-regions"
                    aria-controls="tabpanel-regions"
                    aria-selected={view === "regions"}
                    onClick={() => setView("regions")}
                  >
                    Regions · {regions.length}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className="tab"
                    id="tab-places"
                    aria-controls="tabpanel-places"
                    aria-selected={view === "places"}
                    onClick={() => setView("places")}
                  >
                    Places · {pois.pois.length}
                  </button>
                </div>
                {regions.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Hide panel"
                    onClick={() => setPanelOpen(false)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>

              {view === "regions" ? (
                <div className="map-panel-body" role="tabpanel" id="tabpanel-regions" aria-labelledby="tab-regions">
                  {running && job && (
                    <div className="card brackets">
                      <div className="card-head">
                        <span className="label">{job.region?.label ?? "Download"}</span>
                        <JobBadge job={job} />
                      </div>
                      <JobView job={job} />
                      <button type="button" className="btn btn-block" onClick={() => setView("add")}>
                        Open download
                      </button>
                    </div>
                  )}

                  {regionError && (
                    <Banner tone="crit" title="Could not delete the region">
                      {regionError}
                    </Banner>
                  )}

                  {regions.length === 0 ? (
                    <div className="empty">
                      <Icon name="map" />
                      <p className="empty-title">No regions yet</p>
                      <p>Download a city, state or country once. It then works with no internet.</p>
                    </div>
                  ) : (
                    <>
                      <p className="label">
                        {regions.length} on disk · {bytes(totalBytes)} · all shown
                      </p>
                      <ul className="list">
                        {regions.map((r) => (
                          <RegionRow
                            key={r.name}
                            region={r}
                            confirming={pendingDelete === r.name}
                            onFocus={() => setRegionFocus({ bbox: r.bbox, at: Date.now() })}
                            onAskDelete={() =>
                              setPendingDelete(pendingDelete === r.name ? null : r.name)
                            }
                            onDelete={() => void remove(r)}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : (
                <div className="map-panel-body" role="tabpanel" id="tabpanel-places" aria-labelledby="tab-places">
                  {pois.error && (
                    <Banner
                      tone="crit"
                      title="Place not saved"
                      action={
                        <button type="button" className="btn btn-ghost" onClick={pois.dismissError}>
                          Dismiss
                        </button>
                      }
                    >
                      {pois.error}
                    </Banner>
                  )}

                  {visiblePois.length === 0 ? (
                    <div className="empty">
                      <Icon name="waypoint" />
                      <p className="empty-title">
                        {pois.pois.length === 0 ? "No saved places" : "None in view"}
                      </p>
                      <p>
                        {pois.pois.length === 0
                          ? "Right-click the map, long-press on touch, or use the button below."
                          : `${pois.pois.length} saved elsewhere. Pan or zoom out to see them.`}
                      </p>
                    </div>
                  ) : (
                    <>
                      <p className="label">
                        {visiblePois.length} in view
                        {pois.pois.length !== visiblePois.length && ` · ${pois.pois.length} total`}
                      </p>
                      <ul className="list">
                        {visiblePois.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="row"
                              aria-current={p.id === selectedPoi || undefined}
                              onClick={() => openPoi(p)}
                            >
                              <span className="row-mk" aria-hidden="true" />
                              <span className="row-main">
                                <span className="row-title">{p.name}</span>
                                <span className="row-meta">{coords(p.lat, p.lon)}</span>
                              </span>
                              <Icon name="chevron" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <div className="map-panel-actions">
                {view === "regions" ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => setView("add")}
                  >
                    <Icon name="plus" />
                    {running ? "Show download" : "Add region"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-block"
                    disabled={!center}
                    onClick={() => center && onPoiCreate(center.lat, center.lon)}
                  >
                    <Icon name="waypoint" />
                    Save place at map centre
                  </button>
                )}
              </div>
            </>
          )}
        </aside>

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
          panelOpen={showPanel}
          onTogglePanel={() => setPanelOpen(!showPanel)}
          onFix={setFix}
        />
      </div>
    );
  }

  return (
    <div className="frame" ref={shell}>
      <div data-strip />
      <header className="header">
        <div className="header-title">
          <span className="label" data-module-label>
            {moduleLabel("maps")}
          </span>
          <h1 className="h1">{title}</h1>
        </div>
        <div className="header-actions">
          <button type="button" data-theme-toggle />
        </div>
      </header>
      {bleed && (
        <div className="context" aria-live="off">
          {preview ? (
            <span>Preview · {preview.label}</span>
          ) : (
            regions && <span>{regions.length ? `${regions.length} regions` : "No regions"}</span>
          )}
          {cursor && (
            <>
              <span>Z{cursor.zoom.toFixed(1)}</span>
              <span>{coords(cursor.lat, cursor.lon)}</span>
            </>
          )}
        </div>
      )}
      <div className="frame-body">
        <main className={bleed ? "content bleed" : "content grid-bg"}>{body}</main>
        <nav data-nav />
      </div>

      {poiDraft && (
        <PoiDialog
          key={poiDraft.kind === "edit" ? poiDraft.poi.id : "new"}
          draft={poiDraft}
          onSave={async (body) => {
            if (poiDraft.kind === "edit") await pois.update(poiDraft.poi.id, body);
            else if (await pois.create(body)) toast("Place saved");
          }}
          onDelete={
            poiDraft.kind === "edit"
              ? async () => {
                  await pois.remove(poiDraft.poi.id);
                  toast("Place deleted");
                }
              : undefined
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

function RegionRow({
  region: r,
  confirming,
  onFocus,
  onAskDelete,
  onDelete,
}: {
  region: Region;
  confirming: boolean;
  onFocus: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
}) {
  return (
    <li>
      <div className="row-actions">
        <button type="button" className="row" onClick={onFocus} aria-label={`Zoom to ${r.label}`}>
          <span className="monogram" aria-hidden="true">
            Z{r.maxzoom}
          </span>
          <span className="row-main">
            <span className="row-title">{r.label}</span>
            <span className="row-meta">
              Z{r.minzoom}–{r.maxzoom} · Build {formatBuild(r.build)}
            </span>
          </span>
          <span className="row-value">{bytes(r.bytes)}</span>
        </button>
        <a
          className="btn btn-icon"
          href={`/pmtiles/${r.name}.pmtiles`}
          download
          title={`Export ${r.name}.pmtiles`}
          aria-label={`Export ${r.label} as a PMTiles file`}
        >
          <Icon name="download" />
        </a>
        <button
          type="button"
          className="btn btn-icon"
          aria-label={confirming ? `Keep ${r.label}` : `Delete ${r.label}`}
          aria-expanded={confirming}
          onClick={onAskDelete}
        >
          <Icon name={confirming ? "close" : "trash"} />
        </button>
      </div>
      {confirming && (
        <div className="region-confirm">
          <p className="help">
            Removes {bytes(r.bytes)} from this device. The area stops working offline. Saved places
            are kept.
          </p>
          <HoldButton label={`Delete ${r.label}`} onConfirm={onDelete} className="btn-block" />
        </div>
      )}
    </li>
  );
}
