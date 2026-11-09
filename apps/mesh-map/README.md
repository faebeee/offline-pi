# mesh-map

An offline map of your [Meshtastic](https://meshtastic.org) mesh. Open
`http://<pi>:8080/mesh-map/` in any browser on the hotspot or LAN to see every node
that shares its position, updated live:

- a marker per node with its short name: green ring and `FRESH` if heard
  in the last 2 hours, amber `OLD` within a day, grey and faded `STALE`
  when older; old and stale markers also show their age (`ABCD · 5 H`).
  The Pi's own node is labelled `BASE`.
- click a marker for status, last heard (UTC), hops, SNR, battery,
  altitude, position and hardware, plus a link to message the node in the
  Mesh module.
- the node list (side panel on wide screens, a sheet on phones, toggled
  from the map controls) sorts nodes by last heard; pick one to fly to it.
  The map controls also zoom, reset north and fit every node in view; the
  amber button shows your own position (the browser only allows that on
  HTTPS or localhost). The map follows the day/night theme of the UI.

"Show on map" on the Nodes tab of the Mesh module
([`apps/mesh`](../mesh/README.md)) opens this map on that node.

- **Map tiles:** reuses the regions the Maps module
  ([`apps/maps`](../maps/README.md)) has downloaded, by mounting
  `MAPS_DATA_DIR` and `MAPS_ASSETS_DIR` **read-only**. It never writes there,
  never downloads anything, and works while Maps is stopped. Regions added in
  Maps appear after a page reload.
- **Nodes:** the browser reads them from the Mesh module at `/mesh/`
  (`api/nodes`, `api/status`, and its `api/live` websocket for updates),
  same origin through core. Sending stays inside the Mesh module.
- **No data of its own:** nothing to back up or move.

## UI

The page is built on the shared Outpost UI package, the workspace
`@offline-pi/ui` (`packages/ui` in the repo root: tokens, fonts, icons, frame
and components; see `DESIGN.md`), which `src/main.ts` imports and Vite
bundles.
The page uses page-relative URLs, so it works under `/mesh-map/`.

## Requirements

- offline-pi installed with the `mesh-map` module (root `./install.sh`; see
  the root README for install, start and uninstall). It depends on `mesh`.
- The Maps module with at least one region downloaded (without one, nodes
  show on a blank map). If Maps isn't installed, `./install.sh` asks for the
  maps data and assets directories instead.
- The Mesh module installed and configured.

What the map can show depends on the other nodes: their owners must share a
position (phone GPS or a fixed position). Channels with reduced position
precision (the public `LongFast` channel by default) send an approximate
position only, about 1 to 2 km. Positions are the last ones heard, not live
tracking.

## In offline-pi

The service `mesh-map` in `compose.yml` in the repo root runs as container
`offline-pi-mesh-map` (image `localhost/offline-pi-mesh-map`) with host
networking, bound to `127.0.0.1:MESH_MAP_PORT`; core proxies it at
`/mesh-map/`. Start/stop it with the switch on the home page or
`./manage.sh start|stop mesh-map`; logs: `./manage.sh logs mesh-map`.

Set in the root `.env` (see the root README):

| Variable | Default | Description |
|---|---|---|
| `MESH_MAP_PORT` | `8086` | Internal port (loopback only), proxied by core at `/mesh-map/`. |
| `MAPS_DATA_DIR` | `./data/maps` | The Maps module's data (`regions.json`, `regions/*.pmtiles`), mounted read-only. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | The Maps module's fonts and sprites, mounted read-only. |

When Maps moves its data, mesh-map follows (same variables); there is no
data of this module to move.

## Development

mesh-map is the workspace `@offline-pi/mesh-map` of the offline-pi monorepo
(npm workspaces + Turborepo). Install once in the repo root, then work here:

```sh
(cd ../.. && npm install)     # every workspace, one lockfile
npm run build                 # page into dist/
MAPS_DATA=../../data/maps MAPS_ASSETS=../../data/maps-assets PORT=8086 npm start
npm run dev                   # Vite on :5173, proxies the data routes to :8086
```

Standalone (without core) the page has no Mesh module at `/mesh/` and shows
no nodes.

`server.mjs` is the whole backend, with no dependencies:

| Route | |
|---|---|
| `GET /api/config` | `{ regions }`, regions re-read from `regions.json` on every call |
| `GET /pmtiles/<region>.pmtiles` | the region archive, with HTTP range requests (read by pmtiles.js in the browser) |
| `GET /fonts/<stack>/<range>.pbf` | glyphs |
| `GET /sprites/<file>` | sprite sheets |
| `GET /healthz` | container healthcheck |
