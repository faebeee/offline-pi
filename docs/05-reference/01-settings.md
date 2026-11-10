# Settings

outpost has one configuration file: `.env` in the project folder. It is
created by `./install.sh` from `.env.example`, which documents every
variable. `start.sh` and `manage.sh` only read it, and core only writes its
own state file (`CORE_DATA_DIR/modules.json`), never `.env`.

`compose.yml` gives every variable a default (`${VAR:-default}`), so a
variable missing from `.env` falls back to the default below. That is why
`./update.sh` never has to write `.env`: it only lists the settings that are
new in `.env.example`.

## Who writes what

| Kind | Variables | How to change them |
|---|---|---|
| Asked by `install.sh` | `PORT`, `BIND_ADDRESS`, `CONTROL_PIN`, `MODULES`, every `*_DIR`, `MESH_CONNECTION`, `MESH_DEVICE`, `MESH_HOST`, `MESH_SEND_PIN` | Re-run `./install.sh` and answer differently |
| Detected by `install.sh` | `PODMAN_GRAPH_ROOT`, `PODMAN_SOCKET`, `VCIO_DEVICE` | Leave as is; detected again on every run |
| Edited by hand | everything else (`SAMPLE_INTERVAL_MS`, `CORE_LOG_LEVEL`, the ports, `KNOWLEDGE_AUTO_SYNC`, ...) | Edit `.env`, then `./start.sh` |

`install.sh` asks `PORT`, `BIND_ADDRESS` and `CONTROL_PIN` on the first run;
on later runs it shows them and asks whether to change them. The mesh
connection and send PIN are asked while mesh is not configured yet.

## Applying a change

- **Any variable edited by hand**: run `./start.sh`. It recreates every
  container, so the new values are used.
- **A `*_DIR`**: run `./install.sh` instead of editing `.env`. It asks for
  every directory again (the current value is the default) and, when the
  answer differs, moves the existing data there before it writes `.env`. See
  [Storage](../02-installation/02-storage.md).
- **`MODULES`**: run `./install.sh` and pick the modules again. Which
  installed modules run is chosen on the home page, not in `.env`.

## Core

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | The one port the network sees: the web app, the API and every module under its path. Host networking, so this is the port on the Pi itself. |
| `BIND_ADDRESS` | `0.0.0.0` | `0.0.0.0` for access from the LAN or hotspot, `127.0.0.1` for this machine only. |
| `MODULES_BIND_ADDRESS` | `127.0.0.1` | Address the modules listen on. Keep `127.0.0.1`: modules are reached through core and must not be exposed on their own. |
| `MODULES` | `maps,knowledge` | Installed modules, comma separated. Available: `maps`, `knowledge`, `mesh`. Only these are built and get a container. |
| `CORE_DATA_DIR` | `./data/core` | Dashboard data: 24 h metric history and power events (`history.json`), and `modules.json` (the modules switched off). Small; the SD card is fine. |
| `SAMPLE_INTERVAL_MS` | `2000` | How often the Pi is sampled and pushed to open dashboards, in milliseconds (minimum 500). |
| `CORE_LOG_LEVEL` | `log` | Least severe level core logs: `verbose`, `debug`, `log`, `warn`, `error`, `fatal`. The Logs screen shows core's lines from this level up. |
| `CONTROL_PIN` | empty | PIN asked before starting or stopping a module from the web app. Empty: anyone who can open the web app can start and stop modules. |
| `PODMAN_GRAPH_ROOT` | empty | Podman's storage root on the host; its `db.sql` lists the containers. Empty: core searches the default locations. Detected. |
| `PODMAN_SOCKET` | empty | Host path of the Podman API socket, used to start and stop modules. Detected. |
| `VCIO_DEVICE` | `/dev/null` | Firmware mailbox for `vcgencmd` (voltages, throttling). `/dev/null` when the host is not a Raspberry Pi. Detected. |

## Maps

| Variable | Default | Meaning |
|---|---|---|
| `MAPS_PORT` | `8081` | Internal port (loopback only). |
| `MAPS_DATA_DIR` | `./data/maps` | Region archives (can be many GB) and the POI database. Point it at the SSD. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Vendored fonts and sprites (about 100 MB). |
| `MAPS_ALLOWED_ORIGINS` | empty | Extra origins allowed to call the maps API, for example `http://maps.local:8080`. |
| `MAPS_DATABASE_URL` | empty | Empty: SQLite in `MAPS_DATA_DIR`. Or a Postgres URL for the POIs. |
| `MAPS_DB_LOGGING` | `false` | Log the database queries of the maps container. |

## Library (knowledge)

| Variable | Default | Meaning |
|---|---|---|
| `KNOWLEDGE_PORT` | `8082` | Internal port. |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | ZIM files of the books chosen on the Library screen, from a few MB to hundreds of GB. Nothing is downloaded until you choose. Point it at the SSD. |
| `KNOWLEDGE_AUTO_SYNC` | `true` | `true`: resume downloads of the selected books when the container starts (after a restart or a power cut). `false`: only from the Library screen or `./manage.sh knowledge sync`. |

## Mesh

| Variable | Default | Meaning |
|---|---|---|
| `MESH_PORT` | `8084` | Internal port. |
| `MESH_DATA_DIR` | `./data/mesh` | Message history (SQLite, small). |
| `MESH_CONNECTION` | empty | `serial` (USB) or `tcp`. Empty: not configured yet, and the web app won't start mesh until `./install.sh` has configured it. |
| `MESH_DEVICE` | `/dev/null` | For `serial`: the stable `/dev/serial/by-id/` path of the node, chosen by `install.sh`. |
| `MESH_HOST` | empty | For `tcp`: hostname or IP address of the node. |
| `MESH_SEND_PIN` | empty | PIN for sending messages from the web app. Empty: no PIN. |
| `MESH_SEND_RATE_LIMIT` | `5/min` | How many messages the web app may send. |

## Development only

These are not in `.env.example`. They are read by core or the Vite dev
server when you run them from the checkout (see
[Monorepo and builds](../06-development/02-monorepo-and-builds.md)).

| Variable | Read by | Meaning |
|---|---|---|
| `APPS_DIR` | core | Where the module manifests (`apps/*/module.json`) are read from. |
| `WEB_DIR` | core | Folder of the built web app to serve at `/`. |
| `INFO_DOCS_DIR` | core | Folder of these docs for the Info screen. Default: the checkout's `docs/`. |
| `CORE_URL` | `npm run dev:web` | The core the dev server proxies to. Default `http://127.0.0.1:8080`. |
