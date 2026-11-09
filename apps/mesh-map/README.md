# mesh-map

An offline map of your [Meshtastic](https://meshtastic.org) mesh. Open
`http://<pi>:8080/mesh-map` in any browser on the hotspot or LAN to see every node
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
- **Nodes:** the screen reads `/api/mesh-map/overview` from core (regions +
  positioned nodes, `apps/core/src/domains/mesh-map/`) and live updates from
  the Socket.IO namespace `/mesh`. Sending stays inside the Mesh module.
- **No data of its own:** nothing to back up or move.

## UI

The module has no UI of its own. The map page is the `/mesh-map` screen of
the single web app (`apps/web`, code in `apps/web/src/features/mesh-map/` and
`apps/web/src/routes/mesh-map.tsx`), built on the shared Outpost UI package
`@offline-pi/ui` (see `DESIGN.md`). It loads the archives, fonts and sprites
from this container through core's passthrough at `/svc/mesh-map/`.

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
networking, bound to `127.0.0.1:MESH_MAP_PORT`; core passes its files through at
`/svc/mesh-map/`. Start/stop it with the switch on the home page or
`./manage.sh start|stop mesh-map`; logs: `./manage.sh logs mesh-map`.

Set in the root `.env` (see the root README):

| Variable | Default | Description |
|---|---|---|
| `MESH_MAP_PORT` | `8086` | Internal port (loopback only), passed through by core at `/svc/mesh-map/`. |
| `MAPS_DATA_DIR` | `./data/maps` | The Maps module's data (`regions.json`, `regions/*.pmtiles`), mounted read-only. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | The Maps module's fonts and sprites, mounted read-only. |

When Maps moves its data, mesh-map follows (same variables); there is no
data of this module to move.

## Development

mesh-map is not an npm workspace: it is a single dependency-free
`server.mjs` (data only, no page). Run it with Node:

```sh
MAPS_DATA=../../data/maps MAPS_ASSETS=../../data/maps-assets PORT=8086 node server.mjs
```

For the map page, run core and the web app from the repo root
(`npm run dev:core`, `npm run dev:web`).

Routes:

| Route | |
|---|---|
| `GET /api/config` | `{ regions }`, regions re-read from `regions.json` on every call |
| `GET /pmtiles/<region>.pmtiles` | the region archive, with HTTP range requests (read by pmtiles.js in the browser) |
| `GET /fonts/<stack>/<range>.pbf` | glyphs |
| `GET /sprites/<file>` | sprite sheets |
| `GET /healthz` | container healthcheck |
