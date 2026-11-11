import { useMeshRequestPositions } from "@outpost/api-client";
import { ago, coords, toast, utcDateTime } from "@outpost/ui/outpost.js";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Marker, Popup, type Map as MapLibreMap } from "../../../app/maplibre";
import { Icon } from "../../../ui/outpost";
import { AGE_LED, AGE_WORD, hops, metaLine, nodeAge, nodeBadge, nodeId, nodeName, type Positioned } from "./nodes";
import type { MeshLayer } from "./useMeshLayer";

function markerElement(): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mk";
  const shape = document.createElement("span");
  shape.className = "mk-shape";
  const label = document.createElement("span");
  label.className = "mk-label";
  b.append(shape, label);
  return b;
}

type MarkersProps = {
  map: MapLibreMap | null;
  layer: MeshLayer;
  selected: number | null;
  onSelect: (num: number | null) => void;
  /** the browser shows its own position: the Pi's node becomes a BASE marker */
  hasFix: boolean;
};

/**
 * The nodes as DOM markers (they survive the map's style swaps): a round
 * .mk-node coloured by age (fresh ok, old cau, stale faded grey), the age in
 * the label for old and stale ones. The Pi's own node is the amber
 * own-position marker while the browser shows no position of its own, and a
 * square marker labelled BASE once it does. A click opens the node's popup.
 */
export function MeshMarkers({ map, layer, selected, onSelect, hasFix }: MarkersProps) {
  const { rows, ownNum, now, nodes, meshPath } = layer;
  const markers = useRef(new Map<number, Marker>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    const all = markers.current;
    const seen = new Set<number>();
    for (const n of rows) {
      seen.add(n.num);
      let marker = all.get(n.num);
      if (!marker) {
        const b = markerElement();
        const num = n.num;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          selectRef.current(num);
        });
        marker = new Marker({ element: b, anchor: "top" }).setLngLat([n.longitude, n.latitude]).addTo(map);
        all.set(n.num, marker);
      } else {
        const at = marker.getLngLat();
        if (at.lng !== n.longitude || at.lat !== n.latitude) marker.setLngLat([n.longitude, n.latitude]);
      }
      const isMe = n.num === ownNum;
      const own = isMe && !hasFix;
      const age = nodeAge(n, now);
      const b = marker.getElement();
      b.classList.toggle("mk-own", own);
      b.classList.toggle("mk-node", !isMe);
      for (const a of ["fresh", "old", "stale"] as const) b.classList.toggle(`is-${a}`, !isMe && a === age);
      b.setAttribute("aria-pressed", String(selected === n.num));
      marker.setOffset([0, own ? -9 : -8]);

      const short = nodeBadge(n);
      const label = isMe ? `${short} · Base` : age === "fresh" ? short : `${short} · ${ago(n.lastHeard, now).replace(/ AGO$/, "")}`;
      b.querySelector(".mk-label")!.textContent = label;
      const spoken = isMe
        ? `${nodeName(n)}, this Pi (base station)`
        : `${nodeName(n)}, mesh node, ${AGE_WORD[age].toLowerCase()}, heard ${ago(n.lastHeard, now).toLowerCase()}`;
      b.setAttribute("aria-label", spoken);
      b.title = spoken;
    }
    for (const [num, marker] of all) {
      if (seen.has(num)) continue;
      marker.remove();
      all.delete(num);
    }
  }, [map, rows, ownNum, hasFix, now, selected]);

  useEffect(
    () => () => {
      for (const m of markers.current.values()) m.remove();
      markers.current.clear();
    },
    [map],
  );

  // popup of the selected node
  const popupEl = useMemo(() => document.createElement("div"), []);
  const popup = useRef<Popup | null>(null);
  useEffect(() => {
    if (!map) return;
    const p = new Popup({ offset: 14, maxWidth: "300px", focusAfterOpen: false });
    p.setDOMContent(popupEl);
    p.on("close", () => selectRef.current(null));
    popup.current = p;
    return () => {
      p.remove();
      popup.current = null;
    };
  }, [map, popupEl]);

  const node = selected != null ? nodes.get(selected) : undefined;
  const pos = node && rows.find((r) => r.num === node.num);
  useEffect(() => {
    const p = popup.current;
    if (!map || !p) return;
    if (pos) {
      p.setLngLat([pos.longitude, pos.latitude]);
      if (!p.isOpen()) p.addTo(map);
    } else if (p.isOpen()) {
      p.remove();
    }
  }, [map, pos?.num, pos?.longitude, pos?.latitude]); // eslint-disable-line react-hooks/exhaustive-deps

  return pos ? createPortal(<NodePopup n={pos} ownNum={ownNum} now={now} meshPath={meshPath} />, popupEl) : null;
}

function NodePopup({ n, ownNum, now, meshPath }: { n: Positioned; ownNum: number | null; now: number; meshPath: string | null }) {
  const isMe = n.num === ownNum;
  const age = nodeAge(n, now);
  const rows: [string, ReactNode][] = [];
  const add = (key: string, value: ReactNode) => {
    if (value != null) rows.push([key, value]);
  };
  if (!isMe) {
    add(
      "Status",
      <span className="status">
        <span className={`led ${AGE_LED[age]}`} />
        <span>{`${AGE_WORD[age]} · ${ago(n.lastHeard, now)}`}</span>
      </span>,
    );
    add("Heard", n.lastHeard ? utcDateTime(n.lastHeard * 1000) : "Never");
    add("Hops", hops(n)?.toUpperCase() ?? null);
    add("SNR", n.snr == null ? null : `${n.snr} dB`);
  }
  add("Battery", n.battery == null ? null : n.battery > 100 ? "PLUGGED IN" : `${n.battery}%${n.voltage ? ` · ${n.voltage} V` : ""}`);
  add("Alt", n.altitude == null ? null : `${n.altitude} m`);
  add("Pos", coords(n.latitude, n.longitude));
  add("HW", n.hwModel ? n.hwModel.replaceAll("_", " ") : null);

  return (
    <div className="map-popup">
      <div className="map-popup-head">
        <strong className="map-popup-title">{nodeName(n)}</strong>
        <span className="label">{isMe ? `${nodeId(n)} · this Pi` : nodeId(n)}</span>
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k} className="node-kv-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {meshPath && (
        <Link to={meshPath} className="btn btn-block">
          <Icon name="message" className="i-sm" />
          {isMe ? "Open Mesh" : "Message in Mesh"}
        </Link>
      )}
    </div>
  );
}

/** The Nodes tab of the panel: empty states, then one row per positioned node. */
export function NodeList({
  layer,
  selected,
  onPick,
}: {
  layer: MeshLayer;
  selected: number | null;
  onPick: (n: Positioned) => void;
}) {
  const { rows, ownNum, now, state, total } = layer;
  const without = total - rows.length;

  let empty: [string, string, string] | null = null;
  if (state === "stopped") empty = ["offline", "Mesh is not running", "Start it on the home page; the nodes appear here and on the map."];
  else if (!rows.length) {
    if (state === "connecting") empty = ["mesh", "Connecting", "Reading the node list from Mesh."];
    else if (state === "unreachable") empty = ["offline", "No node data", "Mesh is not answering. Nodes appear once it is reachable."];
    else if (total) empty = ["waypoint", "No positions yet", "Nodes appear here once their owners share a position."];
    else empty = ["mesh", "No nodes heard", "Nodes appear here as the radio hears them."];
  }

  return (
    <>
      {state === "unreachable" && rows.length > 0 && (
        <p className="help">Mesh is not answering. Showing positions as last loaded, with their age.</p>
      )}
      {empty ? (
        <div className="empty">
          <Icon name={empty[0]} />
          <p className="empty-title">{empty[1]}</p>
          <p>{empty[2]}</p>
        </div>
      ) : (
        <p className="label">
          {rows.length} on map{without > 0 ? ` · ${without} without position` : ""}
        </p>
      )}
      {state !== "stopped" && rows.length > 0 && (
        <ul className="list">
          {rows.map((n) => {
            const isMe = n.num === ownNum;
            const age = nodeAge(n, now);
            return (
              <li key={n.num}>
                <button
                  type="button"
                  className="row has-mono"
                  aria-current={selected === n.num ? "true" : undefined}
                  onClick={() => onPick(n)}
                >
                  <span className="monogram">{nodeBadge(n).slice(0, 4)}</span>
                  <span className="row-main">
                    <span className="row-title">{nodeName(n)}</span>
                    <span className="row-meta">{metaLine(n, ownNum, now)}</span>
                  </span>
                  <span className="row-value status">
                    <span className={`led ${isMe ? "led-info" : AGE_LED[age]}`} />
                    <span>{isMe ? "BASE" : AGE_WORD[age].toUpperCase()}</span>
                  </span>
                  <Icon name="chevron" className="i-sm" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Asks every node for its position now (nodes broadcast it rarely). Mesh
 * sends the requests one every 5 s; the replies move the markers live. The
 * button stays busy until every node has been asked.
 */
export function RequestPositionsButton({ layer }: { layer: MeshLayer }) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const request = useMeshRequestPositions({
    mutation: {
      onSuccess: ({ queued, seconds }) => {
        if (!queued) {
          toast("No nodes to ask yet");
          return;
        }
        setUntil(Date.now() + seconds * 1000);
        toast(`Asking ${queued} ${queued === 1 ? "node" : "nodes"} for their position`);
      },
      onError: (err) => toast(err instanceof Error ? err.message : "Request failed"),
    },
  });

  const left = Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) {
        setUntil(0);
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  const busy = request.isPending || left > 0;
  return (
    <button
      type="button"
      className="btn btn-block"
      disabled={busy || layer.state !== "live" || layer.total < 2}
      onClick={() => request.mutate()}
    >
      <Icon name="refresh" />
      {left > 0 ? `Asking nodes · ${left} s` : "Request positions"}
    </button>
  );
}
