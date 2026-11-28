/**
 * Socket.IO namespaces of core and the events each one sends. The payload
 * types are core's DTOs (registered with registerEventModels() in each
 * domain's *.events.ts), generated into ./generated/model.
 *
 * Adding live events to a domain: emit them in its *.events.ts, register
 * the payload classes, run `npm run api:gen`, then add them here.
 */
import { io, type Socket } from "socket.io-client";
import type { Job, LogBatch, LogFollowError, Snapshot, SystemInit, UpdateStatus } from "./generated/model";

export interface ServerEvents {
  "/system": {
    init: (data: SystemInit) => void;
    snapshot: (data: Snapshot) => void;
    /** the update check has a new result (or started / finished a check) */
    update: (data: UpdateStatus) => void;
  };
  "/maps": {
    /** a watched job changed (until it is done, failed or cancelled) */
    job: (data: Job) => void;
  };
  "/logs": {
    /** new lines of a followed source, in batches */
    entries: (data: LogBatch) => void;
    /** a followed source's stream failed or ended (container stopped); follow again to resume */
    followError: (data: LogFollowError) => void;
  };
}

/** Events the browser sends, per namespace. */
export interface ClientEvents {
  "/system": Record<string, never>;
  "/maps": {
    watchJob: (jobId: string) => void;
    unwatchJob: (jobId: string) => void;
  };
  "/logs": {
    /** source = "core" or a module id */
    follow: (source: string) => void;
    unfollow: (source: string) => void;
  };
}

export type Namespace = keyof ServerEvents;
export type NamespaceSocket<N extends Namespace> = Socket<ServerEvents[N], ClientEvents[N]>;

/** Connects to a namespace on core (same origin, /socket.io). */
export function connect<N extends Namespace>(namespace: N): NamespaceSocket<N> {
  return io(namespace, { path: "/socket.io", transports: ["websocket", "polling"] }) as NamespaceSocket<N>;
}
