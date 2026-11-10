import {
  getMapsRegionsQueryKey,
  getMapsStatusQueryKey,
  mapsDeleteRegion,
  useMapsRegions,
  useMapsStatus,
  type Job,
  type PlaceCandidate,
  type Poi,
  type Region,
  type RegionsResponse,
} from "@outpost/api-client";
import { bytes, coords, toast, type StripItem } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LngLatBounds, type Map as MapLibreMap } from "../../app/maplibre";
import { Screen } from "../../app/Screen";
import { useStripItems, useStripLink } from "../../app/strip";
import { Banner, HoldButton, Icon, Illustration, useTheme } from "../../ui/outpost";
import { ModuleGate } from "../modules/ModuleGate";
import { isRunning, useModule } from "../modules/useModules";
import { AddRegion, JobBadge } from "./AddRegion";
import { JobView } from "./JobView";
import { formatBuild, isJobFinished, pmtilesUrl, toBbox, type Bbox } from "./lib";
import { MapView, type Cursor, type Fix, type RegionFocus } from "./MapView";
import "./maps.css";
import { MeshMarkers, NodeList } from "./mesh/MeshNodes";
import { nodeId, type Positioned } from "./mesh/nodes";
import { MeshFeed, meshStripItem, useMeshLayer } from "./mesh/useMeshLayer";
import { PoiDialog, type PoiDraft } from "./PoiDialog";
import { SetupGate } from "./SetupGate";
import { useJob } from "./useJob";
import { usePois } from "./usePois";

/** Side panel next to the map from this width; a bottom sheet below it. */
const WIDE = "(min-width: 720px)";
const isWide = () => window.matchMedia(WIDE).matches;

/** Zoom when flying to a node picked from the list. */
const NODE_ZOOM = 13;

type PanelView = "regions" | "places" | "nodes" | "add";

/**
 * Offline maps: the downloaded regions on one map, saved places, the
 * Meshtastic nodes as a layer that can be switched on and off, and the
 * add-region flow (search, detail level, estimate, confirm, progress).
 * `linkedNode` (?node=!abcd1234, Mesh's "Show on map") opens that node.
 */
export function MapsScreen({ linkedNode }: { linkedNode?: string }) {
  const qc = useQueryClient();
  const theme = useTheme();
  const running = isRunning(useModule("maps"));

  const regionsQuery = useMapsRegions({ query: { enabled: running } });
  const statusQuery = useMapsStatus({ query: { enabled: running } });
  const regions = regionsQuery.data?.regions ?? null;
  const status = statusQuery.data ?? null;
  const error = regionsQuery.error ?? statusQuery.error;

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
  const pois = usePois(running);
  const [bounds, setBounds] = useState<Bbox | null>(null);
  const [poiDraft, setPoiDraft] = useState<PoiDraft | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const [poiFocus, setPoiFocus] = useState<{ lat: number; lon: number } | null>(null);

  // --- mesh nodes layer ---
  const mesh = useMeshLayer();
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const panelView: PanelView = view === "nodes" && !mesh.active ? "regions" : view;

  const pickNode = useCallback(
    (n: Positioned) => {
      setSelectedNode(n.num);
      map?.easeTo({ center: [n.longitude, n.latitude], zoom: Math.max(map.getZoom(), NODE_ZOOM), duration: 400 });
      // the phone sheet covers the map: close it so the popup is visible
      if (!isWide()) setPanelOpen(false);
    },
    [map],
  );

  const fitNodes = () => {
    if (!map || !mesh.rows.length) return;
    const nodeBounds = new LngLatBounds();
    for (const n of mesh.rows) nodeBounds.extend([n.longitude, n.latitude]);
    map.fitBounds(nodeBounds, { padding: 60, maxZoom: NODE_ZOOM, duration: 400 });
  };

  const toggleMesh = () => {
    if (mesh.on) setSelectedNode(null);
    mesh.setOn(!mesh.on);
  };

  // `?node=` from Mesh: show the layer, open the node once it is loaded, then
  // drop the parameter (keeping the camera hash) so a reload doesn't jump back
  const linked = useRef(linkedNode ?? null);
  const { available: meshAvailable, on: meshOn, setOn: setMeshOn, rows: nodeRows } = mesh;
  useEffect(() => {
    if (linked.current && meshAvailable && !meshOn) setMeshOn(true);
  }, [meshAvailable, meshOn, setMeshOn]);
  useEffect(() => {
    if (!map || !linked.current) return;
    const n = nodeRows.find((x) => nodeId(x) === linked.current);
    if (!n) return;
    linked.current = null;
    pickNode(n);
    history.replaceState(history.state, "", `${location.pathname}${location.hash}`);
  }, [map, nodeRows, pickNode]);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: getMapsRegionsQueryKey() }),
      qc.refetchQueries({ queryKey: getMapsStatusQueryKey() }),
    ]);
    return qc.getQueryData<RegionsResponse>(getMapsRegionsQueryKey())?.regions ?? [];
  }, [qc]);

  const onJobFinished = useCallback(
    (job: Job) => {
      void refresh().then((next) => {
        // Jump to whatever was just downloaded.
        if (job.type === "download" && job.state === "done" && job.region) {
          const added = next.find((r) => r.name === job.region?.name);
          if (added) setRegionFocus({ bbox: toBbox(added.bbox), at: Date.now() });
          setView("regions");
          setPreview(null);
          toast(`${job.region.label} cached. It now works offline.`);
        }
      });
    },
    [refresh],
  );

  const { job, track } = useJob(running, onJobFinished);

  const downloading = !!job && job.type === "download" && !isJobFinished(job);
  const totalBytes = regions?.reduce((sum, r) => sum + r.bytes, 0) ?? 0;

  // Status strip: the link to this module's own data source (the map server)
  // plus what it actually knows.
  useStripLink(
    error ? "crit" : regions ? "ok" : "cau",
    error
      ? "LOCAL · NO ANSWER"
      : regions
        ? `LOCAL · ${regions.length} ${regions.length === 1 ? "REGION" : "REGIONS"}`
        : "LOCAL · CONNECTING",
  );
  const items: StripItem[] = [];
  if (fix) items.push({ label: "GNSS", value: `±${Math.round(fix.accuracy)} M` });
  if (downloading && job?.progress) items.push({ label: "DL", value: `${Math.round(job.progress.percent)}%` });
  if (regions?.length) items.push({ label: "DISK", value: bytes(totalBytes) });
  const nodesItem = meshStripItem(mesh);
  if (nodesItem) items.push(nodesItem);
  useStripItems(items);

  async function remove(region: Region) {
    setPendingDelete(null);
    setRegionError(null);
    try {
      await mapsDeleteRegion(region.name);
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
    return pois.pois.filter((p) => p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon);
  }, [pois.pois, bounds]);

  const onPoiCreate = useCallback((lat: number, lon: number) => {
    setPoiDraft({ kind: "create", lat, lon });
  }, []);

  const { update: updatePoi } = pois;
  const onPoiMove = useCallback(
    (id: string, lat: number, lon: number) => {
      void updatePoi(id, { lat, lon });
    },
    [updatePoi],
  );

  // Clicking a marker opens its editor; the dialog is the only place to edit.
  const onPoiSelect = useCallback(
    (id: string) => {
      setSelectedPoi(id);
      const poi = pois.pois.find((p) => p.id === id);
      if (poi) setPoiDraft((draft) => draft ?? { kind: "edit", poi });
    },
    [pois.pois],
  );

  const openPoi = useCallback((poi: Poi) => {
    setSelectedPoi(poi.id);
    setPoiFocus({ lat: poi.lat, lon: poi.lon });
    setPoiDraft({ kind: "edit", poi });
  }, []);

  const closeAdd = useCallback(() => {
    setView("regions");
    setPreview(null);
  }, []);

  // ------------------------------------------------------------- body ---

  let body: ReactNode;
  let bleed = false;
  let title = "Offline map";

  if (error && !regions) {
    title = "Not connected";
    body = (
      <Banner
        tone="crit"
        title="Map server unreachable"
        action={
          <button type="button" className="btn" onClick={() => void refresh()}>
            <Icon name="refresh" />
            Retry
          </button>
        }
      >
        {error.message}. Check the Maps module on the home page, then retry.
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
    const center = bounds ? { lat: (bounds[1] + bounds[3]) / 2, lon: (bounds[0] + bounds[2]) / 2 } : null;

    body = (
      <div className={`map-stage${showPanel ? " is-open" : ""}`}>
        <aside id="maps-panel" className="map-panel" aria-label="Regions and places" hidden={!showPanel}>
          {panelView === "add" ? (
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
                    aria-selected={panelView === "regions"}
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
                    aria-selected={panelView === "places"}
                    onClick={() => setView("places")}
                  >
                    Places · {pois.pois.length}
                  </button>
                  {mesh.active && (
                    <button
                      type="button"
                      role="tab"
                      className="tab"
                      id="tab-nodes"
                      aria-controls="tabpanel-nodes"
                      aria-selected={panelView === "nodes"}
                      onClick={() => setView("nodes")}
                    >
                      Nodes · {mesh.rows.length}
                    </button>
                  )}
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

              {panelView === "nodes" ? (
                <div className="map-panel-body" role="tabpanel" id="tabpanel-nodes" aria-labelledby="tab-nodes">
                  <NodeList layer={mesh} selected={selectedNode} onPick={pickNode} />
                </div>
              ) : panelView === "regions" ? (
                <div className="map-panel-body" role="tabpanel" id="tabpanel-regions" aria-labelledby="tab-regions">
                  {downloading && job && (
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
                      <Illustration name="maps" />
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
                            onFocus={() => setRegionFocus({ bbox: toBbox(r.bbox), at: Date.now() })}
                            onAskDelete={() => setPendingDelete(pendingDelete === r.name ? null : r.name)}
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
                      <p className="empty-title">{pois.pois.length === 0 ? "No saved places" : "None in view"}</p>
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
                {panelView === "nodes" ? (
                  <button type="button" className="btn btn-block" disabled={!mesh.rows.length} onClick={fitNodes}>
                    <Icon name="fit" />
                    Show all nodes
                  </button>
                ) : panelView === "regions" ? (
                  <button type="button" className="btn btn-primary btn-block" onClick={() => setView("add")}>
                    <Icon name="plus" />
                    {downloading ? "Show download" : "Add region"}
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
          onMap={setMap}
          meshNodes={mesh.available ? { on: mesh.on, onToggle: toggleMesh } : undefined}
        />
        {mesh.active && (
          <>
            <MeshFeed onLink={mesh.setLink} />
            <MeshMarkers map={map} layer={mesh} selected={selectedNode} onSelect={setSelectedNode} hasFix={!!fix} />
          </>
        )}
      </div>
    );
  }

  const context = bleed ? (
    <>
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
    </>
  ) : undefined;

  return (
    <Screen module="maps" title={title} bleed={bleed} context={context}>
      <ModuleGate id="maps">{body}</ModuleGate>

      {poiDraft && (
        <PoiDialog
          key={poiDraft.kind === "edit" ? poiDraft.poi.id : "new"}
          draft={poiDraft}
          onSave={async (req) => {
            if (poiDraft.kind === "edit") await pois.update(poiDraft.poi.id, req);
            else if (await pois.create(req)) toast("Place saved");
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
    </Screen>
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
          href={pmtilesUrl(r.name)}
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
            Removes {bytes(r.bytes)} from this device. The area stops working offline. Saved places are kept.
          </p>
          <HoldButton label={`Delete ${r.label}`} onConfirm={onDelete} className="btn-block" />
        </div>
      )}
    </li>
  );
}
