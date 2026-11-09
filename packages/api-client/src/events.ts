/**
 * Socket.IO namespaces of core and the events each one sends. The payload
 * types are core's DTOs (registered with registerEventModels() in each
 * domain's *.events.ts), generated into ./generated/model.
 *
 * Adding live events to a domain: emit them in its *.events.ts, register
 * the payload classes, run `npm run api:gen`, then add them here.
 */
import { io, type Socket } from "socket.io-client";
import type { Job, MeshLink, MeshMessage, MeshNode, RadioStatus, Snapshot, SystemInit } from "./generated/model";

export interface ServerEvents {
  "/system": {
    init: (data: SystemInit) => void;
    snapshot: (data: Snapshot) => void;
  };
  "/maps": {
    /** a watched job changed (until it is done, failed or cancelled) */
    job: (data: Job) => void;
  };
  "/mesh": {
    /** core's connection to the mesh container's live feed */
    link: (data: MeshLink) => void;
    status: (data: RadioStatus) => void;
    /** a new message, or a change to one (sent, acked, failed) */
    message: (data: MeshMessage) => void;
    node: (data: MeshNode) => void;
    nodes: (data: MeshNode[]) => void;
  };
}

/** Events the browser sends, per namespace. */
export interface ClientEvents {
  "/system": Record<string, never>;
  "/maps": {
    watchJob: (jobId: string) => void;
    unwatchJob: (jobId: string) => void;
  };
  "/mesh": Record<string, never>;
}

export type Namespace = keyof ServerEvents;
export type NamespaceSocket<N extends Namespace> = Socket<ServerEvents[N], ClientEvents[N]>;

/** Connects to a namespace on core (same origin, /socket.io). */
export function connect<N extends Namespace>(namespace: N): NamespaceSocket<N> {
  return io(namespace, { path: "/socket.io", transports: ["websocket", "polling"] }) as NamespaceSocket<N>;
}
