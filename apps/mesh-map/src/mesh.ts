/** A row of the Mesh module's `GET /api/nodes` and its `node`/`nodes` live events. */
export type MeshNode = {
  num: number;
  node_id: string | null;
  long_name: string | null;
  short_name: string | null;
  hw_model: string | null;
  /** unix seconds */
  last_heard: number | null;
  snr: number | null;
  hops_away: number | null;
  /** percent; above 100 means "plugged in" */
  battery: number | null;
  voltage: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
};

export type MeshState = "connecting" | "live" | "unreachable";

/** Why the mesh is unreachable: no connection at all, or the node list refused. */
export type MeshReason = "no-answer" | "blocked";

export type MeshEvents = {
  onNodes: (nodes: Map<number, MeshNode>) => void;
  onMyNum: (num: number) => void;
  onState: (state: MeshState, reason?: MeshReason) => void;
};

const RETRY_MIN = 2_000;
const RETRY_MAX = 30_000;
const PING_MS = 25_000;

/**
 * Follows the Mesh module at `base` (e.g. http://pi:8080/mesh, same origin
 * through core's gateway): REST for the node list, then its `/api/live`
 * websocket for updates. Every (re)connect reloads the list, so nothing
 * missed while away is lost. Returns a function that stops it.
 */
export function connectMesh(base: string, events: MeshEvents): () => void {
  const ws0 = new URL(`${base}/api/live`);
  ws0.protocol = ws0.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = ws0.href;
  const nodes = new Map<number, MeshNode>();
  let stopped = false;
  let ws: WebSocket | null = null;
  let retry = RETRY_MIN;
  let retryTimer: number | undefined;
  let ping: number | undefined;

  const merge = (rows: MeshNode[]) => {
    for (const row of rows) nodes.set(row.num, row);
    events.onNodes(nodes);
  };

  const load = async () => {
    const res = await fetch(`${base}/api/nodes`);
    if (!res.ok) throw new Error(`mesh answered ${res.status}`);
    const rows = (await res.json()) as MeshNode[];
    if (stopped) return;
    nodes.clear();
    merge(rows);
    try {
      const status = (await (await fetch(`${base}/api/status`)).json()) as { node_num?: number };
      if (status.node_num != null) events.onMyNum(status.node_num);
    } catch {
      // only used to label the Pi's own node
    }
  };

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      retry = RETRY_MIN;
      ping = window.setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
      load()
        .then(() => !stopped && events.onState("live"))
        // the websocket is up but the list failed
        .catch(() => !stopped && events.onState("unreachable", "blocked"));
    };
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data as string) as { type: string; data: unknown };
      if (type === "node") merge([data as MeshNode]);
      else if (type === "nodes") merge(data as MeshNode[]);
      else if (type === "status") {
        const num = (data as { node_num?: number }).node_num;
        if (num != null) events.onMyNum(num);
      }
    };
    ws.onclose = () => {
      window.clearInterval(ping);
      if (stopped) return;
      events.onState("unreachable", "no-answer");
      retryTimer = window.setTimeout(connect, retry);
      retry = Math.min(retry * 2, RETRY_MAX);
    };
  };

  events.onState("connecting");
  connect();
  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    window.clearInterval(ping);
    ws?.close();
  };
}

export const hasPosition = (n: MeshNode): n is MeshNode & { latitude: number; longitude: number } =>
  n.latitude != null && n.longitude != null;

export const nodeId = (n: MeshNode) => n.node_id || `!${(n.num >>> 0).toString(16).padStart(8, "0")}`;
export const nodeName = (n: MeshNode) => n.long_name || n.short_name || nodeId(n);
/** Badge text: the short name, else the last 4 hex digits of the id. */
export const nodeBadge = (n: MeshNode) => n.short_name || nodeId(n).slice(-4);

/** fresh: heard within 2 h; old: within a day; stale: longer, or never. */
export function nodeAge(n: MeshNode, now: number): "fresh" | "old" | "stale" {
  if (!n.last_heard) return "stale";
  const age = now - n.last_heard;
  return age < 2 * 3600 ? "fresh" : age < 86400 ? "old" : "stale";
}
