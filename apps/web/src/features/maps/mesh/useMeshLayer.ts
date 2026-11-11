import {
  getMeshNodesQueryKey,
  getMeshStatusQueryKey,
  useMeshNodes,
  useMeshStatus,
  type MeshNode,
  type RadioStatus,
} from "@outpost/api-client";
import { onVisibility } from "@outpost/ui/outpost.js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSocketEvent } from "../../../app/realtime";
import { upsertNodes } from "../../mesh/useMesh";
import { isRunning, useModule } from "../../modules/useModules";
import { positioned, type Positioned } from "./nodes";

/**
 * Where the node layer gets its data: off (Mesh not installed), stopped
 * (installed, not running), connecting, unreachable (core lost the mesh
 * container's live feed) or live.
 */
export type MeshState = "off" | "stopped" | "connecting" | "unreachable" | "live";

const STORAGE_KEY = "maps.meshNodes";

function loadOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveOn(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

export type MeshLayer = {
  /** Mesh is installed, so the layer can be switched on */
  available: boolean;
  /** the user's choice (remembered in this browser) */
  on: boolean;
  setOn: (on: boolean) => void;
  /** on and available: markers, the Nodes tab and the live feed are active */
  active: boolean;
  state: MeshState;
  /** every node heard */
  total: number;
  /** nodes with a position, own node first, then most recently heard */
  rows: Positioned[];
  nodes: Map<number, MeshNode>;
  ownNum: number | null;
  /** seconds, ticks every minute for the ages */
  now: number;
  /** path of the Mesh screen, for "Message in Mesh" */
  meshPath: string | null;
  /** the link state reported by <MeshFeed> (render it while active) */
  setLink: (link: boolean | null) => void;
};

/**
 * The Meshtastic nodes as a layer of the offline map. Nodes and the own node
 * number come from the mesh domain's REST endpoints, live updates from the
 * /mesh socket namespace (see <MeshFeed>).
 */
export function useMeshLayer(): MeshLayer {
  const mesh = useModule("mesh");
  const available = !!mesh?.installed;
  const running = isRunning(mesh);
  const [on, setOnState] = useState(loadOn);
  const setOn = useCallback((next: boolean) => {
    setOnState(next);
    saveOn(next);
  }, []);
  const active = on && available;
  const enabled = active && running;

  const nodesQuery = useMeshNodes({ query: { enabled } });
  const statusQuery = useMeshStatus({ query: { enabled } });
  const [link, setLink] = useState<boolean | null>(null);

  const nodes = useMemo(() => new Map((nodesQuery.data ?? []).map((n) => [n.num, n])), [nodesQuery.data]);
  const ownNum = statusQuery.data?.nodeNum ?? null;
  const rows = useMemo(() => positioned(nodes, ownNum), [nodes, ownNum]);

  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    let visible = document.visibilityState === "visible";
    const off = onVisibility((v) => {
      visible = v;
      if (v) setNow(Date.now() / 1000);
    });
    const timer = window.setInterval(() => visible && setNow(Date.now() / 1000), 60_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [active]);

  const state: MeshState = !available
    ? "off"
    : !running
      ? "stopped"
      : nodesQuery.error && !nodesQuery.data
        ? "unreachable"
        : link == null || !nodesQuery.data
          ? "connecting"
          : link
            ? "live"
            : "unreachable";

  return {
    available,
    on,
    setOn,
    active,
    state,
    total: nodes.size,
    rows,
    nodes,
    ownNum,
    now,
    meshPath: available && mesh ? mesh.path : null,
    setLink,
  };
}

/**
 * The /mesh socket while the node layer is shown: node and status events go
 * into the query cache; when the link comes (back) up, the lists are
 * reloaded so nothing missed is lost.
 */
export function MeshFeed({ onLink }: { onLink: (link: boolean | null) => void }) {
  const qc = useQueryClient();
  const [link, setLink] = useState<boolean | null>(null);
  const { connected } = useSocketEvent("/mesh", "link", (l) => setLink(l.connected));
  useSocketEvent("/mesh", "status", (s: RadioStatus) =>
    qc.setQueryData<RadioStatus>(getMeshStatusQueryKey(), (old) => ({ ...old, ...s, config: s.config ?? old?.config })),
  );
  useSocketEvent("/mesh", "node", (n) => upsertNodes(qc, [n]));
  useSocketEvent("/mesh", "nodes", (ns) => upsertNodes(qc, ns));

  // a dropped socket also drops core's link report until it says again
  useEffect(() => {
    if (!connected) setLink(null);
  }, [connected]);

  useEffect(() => {
    onLink(link);
    if (link) {
      void qc.invalidateQueries({ queryKey: getMeshNodesQueryKey() });
      void qc.invalidateQueries({ queryKey: getMeshStatusQueryKey() });
    }
  }, [link, onLink, qc]);
  useEffect(() => () => onLink(null), [onLink]);
  return null;
}
