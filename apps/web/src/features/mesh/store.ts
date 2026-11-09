import { useSyncExternalStore } from "react";

/**
 * Browser-side mesh state shared by the layout and its screens: the live
 * link, which conversation is on screen and what has been read. Read
 * markers and the last conversation persist in localStorage (best effort).
 */
export type Live = "connecting" | "open" | "closed";

interface MeshUiState {
  live: Live;
  /** the conversation on screen (chats view only) */
  current: string | null;
  /** conv -> id of the newest message read */
  lastRead: Record<string, number>;
  /** conv -> unread messages counted live since the page loaded */
  counts: Record<string, number>;
}

const LAST_READ = "mesh.lastRead";
const LAST_CONV = "mesh.current";
const PIN = "mesh.pin";

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: only this page remembers it
  }
}

function loadLastRead(): Record<string, number> {
  try {
    return JSON.parse(load(LAST_READ) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

let state: MeshUiState = { live: "connecting", current: null, lastRead: loadLastRead(), counts: {} };
const listeners = new Set<() => void>();

function set(patch: Partial<MeshUiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

export const meshUi = {
  get: () => state,
  setLive(live: Live) {
    if (state.live !== live) set({ live });
  },
  setCurrent(current: string | null) {
    if (state.current !== current) set({ current });
  },
  markRead(conv: string, id: number | undefined) {
    if (!id) return;
    const done = (state.lastRead[conv] || 0) >= id;
    if (done && !state.counts[conv]) return;
    const lastRead = done ? state.lastRead : { ...state.lastRead, [conv]: id };
    if (!done) save(LAST_READ, JSON.stringify(lastRead));
    set({ lastRead, counts: { ...state.counts, [conv]: 0 } });
  },
  /** unread messages of a conversation whose newest message is `lastId` */
  unread(conv: string, lastId: number | undefined): number {
    if (!lastId || conv === state.current || lastId <= (state.lastRead[conv] || 0)) return 0;
    return state.counts[conv] || 1;
  },
  /** a new incoming message in a conversation that is not on screen */
  countIncoming(conv: string, prevLastId: number | undefined) {
    if (conv === state.current) return;
    set({ counts: { ...state.counts, [conv]: meshUi.unread(conv, prevLastId) + 1 } });
  },
  lastConv: () => load(LAST_CONV) || null,
  setLastConv: (conv: string | null) => save(LAST_CONV, conv ?? ""),
  pin: () => load(PIN) || "",
  setPin: (pin: string) => save(PIN, pin),
};

export function useMeshUi(): MeshUiState {
  return useSyncExternalStore(subscribe, () => state);
}
