import { connect, type Namespace, type NamespaceSocket, type ServerEvents } from "@offline-pi/api-client";
import { useEffect, useRef, useState } from "react";

/**
 * One Socket.IO connection per namespace (/system, /maps, /mesh), shared by
 * every component that uses it and closed when the last one unmounts.
 */
const sockets = new Map<Namespace, { socket: NamespaceSocket<Namespace>; users: number }>();

function acquire<N extends Namespace>(ns: N): NamespaceSocket<N> {
  let entry = sockets.get(ns);
  if (!entry) {
    entry = { socket: connect(ns) as unknown as NamespaceSocket<Namespace>, users: 0 };
    sockets.set(ns, entry);
  }
  entry.users++;
  return entry.socket as unknown as NamespaceSocket<N>;
}

function release(ns: Namespace) {
  const entry = sockets.get(ns);
  if (!entry) return;
  entry.users--;
  if (entry.users <= 0) {
    // a little grace, so route changes don't reconnect
    setTimeout(() => {
      const e = sockets.get(ns);
      if (e && e.users <= 0) {
        e.socket.disconnect();
        sockets.delete(ns);
      }
    }, 2000);
  }
}

/** The namespace's socket and whether it is connected. */
export function useSocket<N extends Namespace>(ns: N): { socket: NamespaceSocket<N> | null; connected: boolean } {
  const [socket, setSocket] = useState<NamespaceSocket<N> | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const s = acquire(ns);
    setSocket(s);
    setConnected(s.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
      release(ns);
    };
  }, [ns]);
  return { socket, connected };
}

/** Calls handler for every `event` on the namespace (latest handler, no resubscribe). */
export function useSocketEvent<N extends Namespace, E extends keyof ServerEvents[N] & string>(
  ns: N,
  event: E,
  handler: ServerEvents[N][E],
): { connected: boolean } {
  const { socket, connected } = useSocket(ns);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (...args: unknown[]) => (ref.current as (...a: unknown[]) => void)(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (socket as any).on(event, fn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => void (socket as any).off(event, fn);
  }, [socket, event]);
  return { connected };
}
