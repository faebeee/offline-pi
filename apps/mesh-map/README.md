# mesh-map

An offline map of your [Meshtastic](https://meshtastic.org) mesh. Open
`http://<pi>:8086` in any browser on the hotspot or LAN to see every node
that shares its position, updated live:

- a marker per node with its short name: green ring and `FRESH` if heard
  in the last 2 hours, amber `OLD` within a day, grey and faded `STALE`
  when older; old and stale markers also show their age (`ABCD · 5 H`).
  The Pi's own node is labelled `BASE`.
- click a marker for status, last heard (UTC), hops, SNR, battery,
  altitude, position and hardware, plus a link to message the node in the
  Mesh app.
- the node list (side panel on wide screens, a sheet on phones, toggled
  from the map controls) sorts nodes by last heard; pick one to fly to it.
  The map controls also zoom, reset north and fit every node in view; the
  amber button shows your own position (the browser only allows that on
  HTTPS or localhost). The map follows the day/night theme of the UI.

"Show on map" on the Nodes tab of [`apps/mesh`](../mesh/README.md) opens
this map on that node.

Its own app, isolated from the others:

- **Map tiles:** reuses the regions [`apps/maps`](../maps/README.md) has
  downloaded, by mounting its data and assets directories **read-only**. It
  never writes there, never downloads anything, and works while `apps/maps`
  is stopped. Regions added in `apps/maps` appear after a page reload.
- **Nodes:** the browser reads them from `apps/mesh` (`/api/nodes`,
  `/api/status`, and its `/api/live` websocket for updates). `apps/mesh`
  allows only this app's port to read them (`MESH_MAP_PORT`, default
  `8086`), and nothing else: sending stays inside the Mesh app.
- **No data of its own:** nothing to back up or move. Uses Podman Compose.

## UI

The page is built on the shared Outpost UI package in [`/ui`](../../ui/README.md)
(tokens, fonts, icons, frame and components; see `DESIGN.md` at the repo
root). `install.sh` and `start.sh` copy it into `src/outpost-ui/` (gitignored)
before building, so change it in `/ui`, never in the copy.

## Requirements

- Raspberry Pi (or any Linux host) with Podman; `install.sh` offers to
  install it.
- [`apps/maps`](../maps/README.md) installed, with at least one region
  downloaded (without one, nodes show on a blank map).
- [`apps/mesh`](../mesh/README.md) running with its default
  `MESH_MAP_PORT=8086` (or set to this app's `PORT`).

What the map can show depends on the other nodes: their owners must share a
position (phone GPS or a fixed position). Channels with reduced position
precision (the public `LongFast` channel by default) send an approximate
position only, about 1 to 2 km. Positions are the last ones heard, not live
tracking.

## Quick start

```sh
git clone <this repo> offline-pi
cd offline-pi/apps/mesh-map
./install.sh
```

Then open the printed URL (port `8086`).

## What `install.sh` does

1. Checks for Podman and a compose backend (offers to install via `apt`).
2. If there is no `.env`: copies `.env.example` and asks for port, bind
   address and the port of the Mesh app.
3. Asks for `apps/maps`' data and assets directories (every run). The first
   time it defaults to what `apps/maps/.env` says; afterwards to the current
   value, and it warns when `apps/maps` has moved its data since. The
   directories must exist; nothing is created, moved or written there.
4. Copies the shared UI package (`../../ui`) into `src/outpost-ui/`, builds
   the image, enables `podman-restart.service` and lingering so the
   app comes back after a reboot, then runs `./start.sh`.

## Configuration (`.env`)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8086` | Web UI. Siblings: 8080 monitor, 8081 maps, 8082 knowledge, 8083 portal, 8084 mesh, 8085 radio |
| `BIND_ADDRESS` | `0.0.0.0` | `127.0.0.1` for this Pi only |
| `MESH_PORT` | `8084` | Port of `apps/mesh` on this host; `off` shows the map without nodes |
| `MAPS_DATA_DIR` | `../maps/data` | `apps/maps`' `DATA_DIR`, mounted read-only (`regions.json`, `regions/*.pmtiles`). If `apps/maps` keeps it on an SSD, e.g. `/mnt/ssd/maps/data`, point here too |
| `MAPS_ASSETS_DIR` | `../maps/assets` | `apps/maps`' `ASSETS_DIR` (fonts, sprites), mounted read-only |

Edit `.env` and run `./start.sh` to apply. When `apps/maps` moves its data
(e.g. to a newly mounted SSD), re-run `./install.sh` here and give the new
paths; there is no data of this app to move.

## Podman usage

The container uses `network_mode: host` (no port mapping, no Podman bridge),
so the app binds `PORT` directly on the Pi's own interfaces instead of going
through Podman's bridge network and `aardvark-dns`, which can get stuck after
the host's network changes (e.g. a Wi-Fi reconnect).

```sh
./start.sh                  # podman compose up -d --build --force-recreate
podman compose logs -f      # follow logs
podman compose down         # stop
```

## Uninstall

```sh
./uninstall.sh
```

Stops and removes the container and the `offline-pi-mesh-map` image, and
removes `.env`. The app has no data directories, and `apps/maps`' map data
is never touched. Podman, `podman-restart.service`, lingering and the
source checkout are left alone; clean up leftover build layers with
`podman image prune`.

## Development

```sh
../../ui/sync.sh src/outpost-ui   # copy the shared UI package
npm install
npm run build                 # page into dist/
MAPS_DATA=../maps/data MAPS_ASSETS=../maps/assets MESH_PORT=8084 PORT=8086 npm start
npm run dev                   # Vite on :5173, proxies the data routes to :8086
```

The Vite dev page runs on port 5173, which `apps/mesh` doesn't allow, so it
shows no nodes unless that `apps/mesh` runs with `MESH_MAP_PORT=5173`.

`server.mjs` is the whole backend, with no dependencies:

| Route | |
|---|---|
| `GET /api/config` | `{ meshPort, regions }`, regions re-read from `regions.json` on every call |
| `GET /pmtiles/<region>.pmtiles` | the region archive, with HTTP range requests (read by pmtiles.js in the browser) |
| `GET /fonts/<stack>/<range>.pbf` | glyphs |
| `GET /sprites/<file>` | sprite sheets |
| `GET /healthz` | container healthcheck |
