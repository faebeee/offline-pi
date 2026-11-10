import {
  systemHistory,
  systemSnapshot,
  type HistoryPoint,
  type PowerEvent,
  type PowerEventKind,
  type Snapshot,
  type SystemInit,
  type ThrottleFlags,
} from "@outpost/api-client";
import { onVisibility } from "@outpost/ui/outpost.js";
import { useEffect, useRef, useState } from "react";
import { useSocket, useSocketEvent } from "../../app/realtime";

/** Link to core's /system namespace, as the old page tracked it. */
export type LinkState = "live" | "connecting" | "reconnecting" | "error";

export const LIVE_WINDOW = 15 * 60e3;
const BUCKET = 60e3;
const DAY = 864e5;

type Store = {
  live: HistoryPoint[];
  minutes: HistoryPoint[];
  events: PowerEvent[];
  snap: Snapshot | null;
  intervalMs: number;
  prevFlags: ThrottleFlags | null;
};

function toPoint(s: Snapshot): HistoryPoint {
  const net = s.network.reduce((a, n) => ({ rx: a.rx + n.rxBps, tx: a.tx + n.txBps }), { rx: 0, tx: 0 });
  return {
    t: s.ts,
    cpu: s.cpu.usage,
    temp: s.temps.cpu,
    volt: s.power.inputVolts,
    mem: s.memory ? (s.memory.used / s.memory.total) * 100 : null,
    rx: net.rx,
    tx: net.tx,
  };
}

const FLAG_KIND: Record<keyof ThrottleFlags, PowerEventKind> = {
  underVoltage: "under-voltage",
  throttled: "throttled",
  freqCapped: "freq-capped",
  softTempLimit: "soft-temp-limit",
};

/**
 * Live system data from core's /system namespace: the latest snapshot,
 * the 15 min and 24 h chart series and the power events. Series are kept
 * in a ref (they grow every sample); the screen re-renders on each sample,
 * except while the tab is hidden (it catches up when shown again).
 */
export function useSystemLive() {
  const store = useRef<Store>({ live: [], minutes: [], events: [], snap: null, intervalMs: 2000, prevFlags: null });
  const [, setVersion] = useState(0);
  const bump = () => {
    if (!document.hidden) setVersion((v) => v + 1);
  };

  const { socket } = useSocket("/system");
  const [link, setLink] = useState<LinkState>("connecting");

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => setLink("live");
    const onDisconnect = () => setLink("reconnecting");
    const onError = () => setLink("error");
    const onAttempt = () => setLink((l) => (l === "error" ? l : "reconnecting"));
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);
    socket.io.on("reconnect_attempt", onAttempt);

    if (socket.connected) {
      // shared socket already connected (e.g. back from another screen):
      // its "init" went out before we listened, so seed over REST
      setLink("live");
      if (!store.current.snap) {
        void Promise.all([systemSnapshot(), systemHistory()])
          .then(([snap, history]) => {
            const st = store.current;
            if (st.snap) return; // a live sample came first
            st.snap = snap;
            st.minutes = history.minutes;
            st.events = history.events;
            st.prevFlags = snap.throttle?.now ?? null;
            bump();
          })
          .catch(() => {
            /* the next snapshot fills the page */
          });
      }
    } else {
      setLink("connecting");
    }
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      socket.io.off("reconnect_attempt", onAttempt);
    };
  }, [socket]);

  useSocketEvent("/system", "init", (data: SystemInit) => {
    const st = store.current;
    st.intervalMs = data.intervalMs;
    st.live = data.live;
    st.minutes = data.minutes;
    st.events = data.events;
    st.prevFlags = data.snapshot?.throttle?.now ?? null;
    if (data.snapshot) st.snap = data.snapshot;
    bump();
  });

  useSocketEvent("/system", "snapshot", (s: Snapshot) => {
    const st = store.current;
    const pt = toPoint(s);
    st.live.push(pt);
    while (st.live.length && st.live[0]!.t < s.ts - LIVE_WINDOW) st.live.shift();
    // fold the sample into the current minute (rough client-side mirror of
    // the server's aggregation; reloading gets the exact server series)
    const last = st.minutes.at(-1);
    const b = Math.floor(s.ts / BUCKET) * BUCKET;
    if (!last || last.t !== b) st.minutes.push({ ...pt, t: b });
    else {
      for (const k of ["cpu", "mem", "rx", "tx"] as const) {
        const v = pt[k];
        if (v != null) last[k] = last[k] == null ? v : (last[k] + v) / 2;
      }
      if (pt.temp != null) last.temp = Math.max(last.temp ?? -Infinity, pt.temp);
      if (pt.volt != null) last.volt = Math.min(last.volt ?? Infinity, pt.volt);
    }
    while (st.minutes.length && st.minutes[0]!.t < s.ts - DAY) st.minutes.shift();

    // firmware flag changes become power events
    const f = s.throttle?.now;
    if (f) {
      if (st.prevFlags) {
        for (const k of Object.keys(FLAG_KIND) as (keyof ThrottleFlags)[]) {
          if (f[k] !== st.prevFlags[k]) st.events.push({ t: s.ts, kind: FLAG_KIND[k], active: f[k] });
        }
      }
      st.prevFlags = f;
    }
    st.snap = s;
    bump();
  });

  // keep the data age current while the link is down
  useEffect(() => {
    if (link === "live") return;
    const id = setInterval(bump, 5000);
    return () => clearInterval(id);
  }, [link]);

  // catch up when the tab is shown again
  useEffect(() => onVisibility((visible) => visible && bump()), []);

  const st = store.current;
  return { snap: st.snap, live: st.live, minutes: st.minutes, events: st.events, intervalMs: st.intervalMs, link };
}
