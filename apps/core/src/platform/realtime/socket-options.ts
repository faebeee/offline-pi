import type { GatewayMetadata } from '@nestjs/websockets';

/**
 * Options for every domain's Socket.IO gateway. They share one server on
 * core's port, one namespace per domain (/system, /maps, /mesh, ...); the
 * event payloads are typed in @offline-pi/api-client (events.ts).
 *
 * destroyUpgrade: false - other upgrades (passthrough WebSockets under
 * /svc/) are piped by the passthrough; engine.io would otherwise close them.
 */
export function socketOptions(namespace: string): GatewayMetadata {
  return { namespace, serveClient: false, destroyUpgrade: false };
}
