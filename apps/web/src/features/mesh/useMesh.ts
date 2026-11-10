import {
  getMeshConversationsQueryKey,
  getMeshMessagesQueryKey,
  getMeshNodesQueryKey,
  getMeshStatusQueryKey,
  meshMessages,
  useMeshConversations,
  useMeshNodes,
  useMeshStatus,
  type Conversation,
  type MeshMessage,
  type MeshNode,
  type RadioStatus,
} from "@outpost/api-client";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSocketEvent } from "../../app/realtime";
import { names, PAGE } from "./format";
import { meshUi } from "./store";

/** Status, nodes and conversations of the radio, plus the name helpers. */
export function useMesh(enabled = true) {
  const status = useMeshStatus({ query: { enabled } });
  const nodes = useMeshNodes({ query: { enabled } });
  const convs = useMeshConversations({ query: { enabled } });
  const n = useMemo(() => names(status.data, nodes.data), [status.data, nodes.data]);
  const error = status.error ?? nodes.error ?? convs.error;
  return {
    ...n,
    config: status.data?.config ?? { maxTextBytes: 200, sendPinRequired: false, rateLimit: { count: 0, window: 0 } },
    nodeList: nodes.data ?? [],
    convs: convs.data ?? [],
    loaded: !!status.data,
    error,
  };
}

/** Query key of one conversation's paged history (useInfiniteQuery). */
export const messagesKey = (conv: string) => [...getMeshMessagesQueryKey({ conv }), "pages"] as const;

type Pages = InfiniteData<MeshMessage[], number | undefined>;

/** One conversation's history, newest page first; older pages via fetchNextPage. */
export function useMessages(conv: string) {
  return useInfiniteQuery({
    queryKey: messagesKey(conv),
    queryFn: ({ pageParam, signal }) =>
      meshMessages({ conv, limit: PAGE, ...(pageParam ? { before: pageParam } : {}) }, { signal }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last: MeshMessage[]) => (last.length < PAGE ? undefined : last[0]?.id),
  });
}

/** Messages of all loaded pages, oldest first, without duplicates. */
export function flatten(data: InfiniteData<MeshMessage[], unknown> | undefined): MeshMessage[] {
  const byId = new Map<number, MeshMessage>();
  for (const page of data?.pages ?? []) for (const m of page) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** A new or changed message (live event or the answer to a send). */
export function upsertMessage(qc: QueryClient, m: MeshMessage) {
  const convs = qc.getQueryData<Conversation[]>(getMeshConversationsQueryKey());
  const prev = convs?.find((c) => c.conv === m.conv);
  if (!prev || m.id > prev.lastId) {
    if (m.direction === "in") meshUi.countIncoming(m.conv, prev?.lastId);
    const row: Conversation = { conv: m.conv, lastId: m.id, lastTime: m.rxTime, count: (prev?.count ?? 0) + 1 };
    qc.setQueryData<Conversation[]>(getMeshConversationsQueryKey(), (old) =>
      old ? [row, ...old.filter((c) => c.conv !== m.conv)] : old,
    );
  }
  qc.setQueryData<Pages>(messagesKey(m.conv), (old) => {
    if (!old) return old;
    let found = false;
    const pages = old.pages.map((page) =>
      page.map((x) => {
        if (x.id !== m.id) return x;
        found = true;
        return m;
      }),
    );
    if (!found) pages[0] = [...(pages[0] ?? []), m];
    return { ...old, pages };
  });
  if (m.direction === "out") meshUi.markRead(m.conv, m.id);
}

/** Live node updates into the cached node list (Mesh screen and the map layer). */
export function upsertNodes(qc: QueryClient, list: MeshNode[]) {
  qc.setQueryData<MeshNode[]>(getMeshNodesQueryKey(), (old) => {
    if (!old) return old;
    const byNum = new Map(old.map((n) => [n.num, n]));
    for (const n of list) byNum.set(n.num, n);
    return [...byNum.values()];
  });
}

/**
 * The /mesh socket: applies live events to the query cache and tracks the
 * link (browser <-> core <-> mesh container). Every time the link comes
 * (back) up, everything is refetched to catch up on missed events.
 */
export function useMeshLive() {
  const qc = useQueryClient();
  const [link, setLink] = useState<boolean | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  const { connected } = useSocketEvent("/mesh", "link", (d) => setLink(d.connected));
  useSocketEvent("/mesh", "status", (s: RadioStatus) =>
    qc.setQueryData<RadioStatus>(getMeshStatusQueryKey(), (old) => ({ ...old, ...s, config: s.config ?? old?.config })),
  );
  useSocketEvent("/mesh", "message", (m) => upsertMessage(qc, m));
  useSocketEvent("/mesh", "node", (n) => upsertNodes(qc, [n]));
  useSocketEvent("/mesh", "nodes", (ns) => upsertNodes(qc, ns));

  // a dropped socket also drops core's link report until it says again
  useEffect(() => {
    if (!connected) setLink(null);
  }, [connected]);

  const open = connected && link === true;
  useEffect(() => {
    if (!open) return;
    setWasOpen(true);
    void qc.invalidateQueries({ queryKey: getMeshStatusQueryKey() });
    void qc.invalidateQueries({ queryKey: getMeshNodesQueryKey() });
    void qc.invalidateQueries({ queryKey: getMeshConversationsQueryKey() });
    void qc.invalidateQueries({ queryKey: getMeshMessagesQueryKey() });
  }, [open, qc]);

  // closed: it was up and is gone (core reports link: false while it first connects)
  const live = open ? "open" : wasOpen ? "closed" : "connecting";
  useEffect(() => meshUi.setLive(live), [live]);
  useEffect(() => () => meshUi.setLive("connecting"), []);
}

/** Re-renders every `ms` (for "3 MIN AGO" ages). */
export function useTick(ms = 60000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
