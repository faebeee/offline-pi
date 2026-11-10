# Paths and ports

Everything outpost offers is on one origin: core on `PORT` (default
`8080`). The browser never talks to a module directly. This page lists what
lives under which path, which internal ports the modules use, and where
their data and logs are.

## Paths on core

| Path | What it is |
|---|---|
| `/` | The web app (`apps/web`). Every other page load that asks for HTML gets its `index.html`, so client-side routes and reloads work. |
| `/api/<domain>/...` | Core's REST API, one domain per feature. See [API](03-api.md). |
| `/api/docs` | Swagger UI for the API. |
| `/api/openapi.json` | The OpenAPI document. |
| `/socket.io` | Live updates over Socket.IO, one namespace per domain. |
| `/svc/<module>/...` | Streaming passthrough to a module's container, for raw files. |
| `/ui/` | The Outpost design system package (`packages/ui`) as static files. |

The paths `/api`, `/svc`, `/socket.io` and `/ui` are never routes of the web
app.

## Screens

| Screen | Path | Module id | Data from |
|---|---|---|---|
| Home | `/` | | core |
| Maps | `/maps` | `maps` | maps container |
| Mesh map | `/mesh-map` | `mesh-map` | mesh-map container |
| Mesh | `/mesh`, `/mesh/nodes` | `mesh` | mesh container |
| Library | `/library`, `/library/catalog`, `/library/read` | `knowledge` | knowledge container |
| System | `/system` | `system` | core |
| Logs | `/logs` | `logs` | core |
| Info | `/info`, `/info/<chapter>/<page>` | `info` | core |

The screens are routes of the one web app. The last column says where the
data behind the screen comes from. The user guide for each screen is in
[Modules](../03-modules/README.md).

## Passthrough

The passthrough path of a module is `/svc` plus its `path` from
`module.json`. It streams in both directions, so range requests (`.pmtiles`),
server-sent events, WebSockets and large downloads pass through unbuffered.

| Passthrough | Forwarded to | Used for |
|---|---|---|
| `/svc/maps/x` | `http://127.0.0.1:8081/x` | Tiles, fonts, sprites, `.pmtiles` range requests |
| `/svc/library/x` | `http://127.0.0.1:8082/svc/library/x` | kiwix articles and its viewer |
| `/svc/mesh/x` | `http://127.0.0.1:8084/x` | Raw files of the mesh container |
| `/svc/mesh-map/x` | `http://127.0.0.1:8086/x` | Map files of the mesh-map container |

The library keeps its prefix (`stripPrefix: false` in its manifest), because
`kiwix-serve` runs with `--urlRootLocation=/svc/library` and its links point
there. A stopped module answers `503`; a path under `/svc/` that matches no
installed module answers `404`.

## Socket.IO namespaces

| Namespace | Domain |
|---|---|
| `/system` | System: snapshots of the Pi |
| `/maps` | Maps: job progress |
| `/mesh` | Mesh: radio status, messages, nodes |
| `/logs` | Logs: lines of a followed source |

The events of each namespace are listed in [API](03-api.md#live-updates).

## Ports and containers

Every container uses host networking. Modules listen on
`MODULES_BIND_ADDRESS` (`127.0.0.1`), so only core is reachable from the
network.

| Service | Container | Image | Port variable | Default port | Listens on |
|---|---|---|---|---|---|
| `core` | `outpost-core` | `outpost-core` | `PORT` | `8080` | `BIND_ADDRESS` |
| `maps` | `outpost-maps` | `outpost-maps` | `MAPS_PORT` | `8081` | `127.0.0.1` |
| `knowledge` | `outpost-knowledge` | `outpost-knowledge` | `KNOWLEDGE_PORT` | `8082` | `127.0.0.1` |
| `mesh` | `outpost-mesh` | `outpost-mesh` | `MESH_PORT` | `8084` | `127.0.0.1` |
| `mesh-map` | `outpost-mesh-map` | `outpost-mesh-map` | `MESH_MAP_PORT` | `8086` | `127.0.0.1` |

The Compose project is always called `outpost`, whatever the folder of
the checkout is called. Only core has `restart: always`; the modules have
`restart: on-failure`.

## Health checks

| Container | Checks |
|---|---|
| core | `GET /api/system/status` |
| maps | `GET /api/status` |
| knowledge | `GET /svc/library/` |
| mesh | `GET /api/status` |
| mesh-map | `GET /healthz` |

## Data directories

Each `*_DIR` on the host is bind-mounted into a container. Relative paths
are relative to the project folder.

| Variable | Host default | Inside the container |
|---|---|---|
| `CORE_DATA_DIR` | `./data/core` | core: `/app/data` |
| `MAPS_DATA_DIR` | `./data/maps` | maps: `/app/apps/maps/data`; mesh-map: `/maps/data` (read-only) |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | maps: `/app/apps/maps/assets`; mesh-map: `/maps/assets` (read-only) |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | knowledge: `/data` |
| `MESH_DATA_DIR` | `./data/mesh` | mesh: `/app/data` |

Core also mounts the host's `/` read-only at `/hostfs` (for `/sys`, the
mounted disks, Podman's state database and its API socket) and maps
`VCIO_DEVICE` to `/dev/vcio_gencmd`. Mesh maps `MESH_DEVICE` to
`/dev/meshtastic`.

## Log files

| File | Written by | Contains |
|---|---|---|
| `install.log` | `./install.sh` | The full output of every step: builds, downloads, compose. Emptied at the start of each run. The `start.sh` it runs at the end appends to it. |
| `start.log` | `./start.sh` on its own | The full output of the build and compose steps. Emptied at the start of each run. |

Both are in the project folder. The scripts only show a progress line and,
on failure, the last lines of the log. The containers' own logs are on the
Logs screen and in `./manage.sh logs [module]`.
