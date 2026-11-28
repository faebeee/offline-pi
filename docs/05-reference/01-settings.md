# Settings

outpost has one configuration file: `.env` in the project folder. It is
created by `./install.sh` from `.env.example`, which documents every
variable. `start.sh` and `manage.sh` only read it, and core only writes its
own files in `CORE_DATA_DIR`, never `.env`. Accounts are not settings: they
are managed in the web app (see [Users and login](../03-modules/14-users.md)).

`compose.yml` gives every variable a default (`${VAR:-default}`), so a
variable missing from `.env` falls back to the default below. That is why
`./update.sh` never has to write `.env`: it only lists the settings that are
new in `.env.example`.

## Who writes what

| Kind | Variables | How to change them |
|---|---|---|
| Asked by `install.sh` | `MODULES`, `OUTPOST_DATA_DIR` (and from it every `*_DIR`), `NETWORK_LEASES_PATH` | Re-run `./install.sh` and answer differently |
| Asked by `install.sh --advanced` | `PORT`, `BIND_ADDRESS`, each `*_DIR` on its own | Re-run `./install.sh --advanced` |
| Detected by `install.sh` | `PODMAN_GRAPH_ROOT`, `PODMAN_SOCKET`, `VCIO_DEVICE` | Leave as is; detected again on every run |
| Edited by hand | everything else (`SAMPLE_INTERVAL_MS`, `CORE_LOG_LEVEL`, the ports, `KNOWLEDGE_AUTO_SYNC`, ...) | Edit `.env`, then `./start.sh` |

Without `--advanced`, `PORT` and `BIND_ADDRESS` keep their current values
(the defaults on a first run: `8080`, every device).

## Applying a change

- **Any variable edited by hand**: run `./start.sh`. It recreates every
  container, so the new values are used.
- **The data folder or a `*_DIR`**: run `./install.sh` (or
  `./install.sh --advanced` for one directory) instead of editing `.env`.
  It asks again (the current value is the default) and, when the answer
  differs, moves the existing data there before it writes `.env`. See
  [Storage](../02-installation/02-storage.md).
- **`MODULES`**: run `./install.sh` and pick the modules again. Which
  installed modules run is chosen on the home page, not in `.env`.

## Setup

| Variable | Default | Meaning |
|---|---|---|
| `OUTPOST_DATA_DIR` | `./data` | The folder all data lives in; every `*_DIR` is a subfolder of it unless set on its own with `install.sh --advanced`. |
| `OUTPOST_REGISTRY` | `ghcr.io/faebeee` | Where the ready-made images come from (`<registry>/outpost-<service>:sha-<commit>`). A fork that publishes its own images sets its `ghcr.io/<owner>`. |
| `OUTPOST_BUILD` | `false` | `true`: always build the images on this machine instead of downloading them. |

## Core

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | The one port the network sees: the web app, the API and every module under its path. Host networking, so this is the port on the Pi itself. |
| `BIND_ADDRESS` | `0.0.0.0` | `0.0.0.0` for access from the LAN or hotspot, `127.0.0.1` for this machine only. |
| `MODULES_BIND_ADDRESS` | `127.0.0.1` | Address the modules listen on. Keep `127.0.0.1`: modules are reached through core and must not be exposed on their own. |
| `MODULES` | `maps,knowledge` | Installed modules, comma separated. Available: `maps`, `knowledge`, `network`. Only these get an image and a container; Files, Board and Supplies are part of core. |
| `CORE_DATA_DIR` | `./data/core` | Core's data: 24 h metric history and power events (`history.json`), `modules.json` (the modules switched off), Board posts (`board.json`), the Supplies list with its household settings (`supplies.json`), and the accounts: `users.json` (user names, roles, password hashes; back it up), `sessions.json` (hashes of the login tokens) and `cli.token` (the local admin token for `./manage.sh`), readable by the owner only. Small. |
| `SAMPLE_INTERVAL_MS` | `2000` | How often the Pi is sampled and pushed to open dashboards, in milliseconds (minimum 500). |
| `CORE_LOG_LEVEL` | `log` | Least severe level core logs: `verbose`, `debug`, `log`, `warn`, `error`, `fatal`. The Logs screen shows core's lines from this level up. |
| `CORE_INTERNET_CHECK_URLS` | `https://build.protomaps.com/,https://download.kiwix.org/` | Servers asked whether the Pi gets out to the internet, for `NET` in the status strip: a HEAD request to the first that answers. These are servers outpost downloads from anyway. Empty: no check, no `NET` item. |
| `CORE_INTERNET_CHECK_INTERVAL_MS` | `60000` | How often that check runs, in milliseconds (minimum 10000). |
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

## Network

| Variable | Default | Meaning |
|---|---|---|
| `NETWORK_PORT` | `8085` | Internal port. |
| `NETWORK_DATA_DIR` | `./data/network` | Block list and the devices seen on the hotspot in the last 30 days (a few KB). The blocking helper watches `blocked.macs` in it. |
| `NETWORK_IFACE` | empty | Hotspot interface, e.g. `wlan0`. Empty: the first Wi-Fi interface in access-point mode. |
| `NETWORK_LEASES_PATH` | `/var/lib/NetworkManager` | Folder with the hotspot's DHCP lease files (IP and hostname), mounted read-only. `install.sh` points it at `NETWORK_DATA_DIR` on hosts without NetworkManager. |

## Files

The shared folder is served by core itself (no container).

| Variable | Default | Meaning |
|---|---|---|
| `FILES_DATA_DIR` | `./data/files` | The shared folder: everything uploaded, as plain files and folders. Grows with every upload; point it at the SSD. |
| `FILES_MAX_UPLOAD_MB` | `4096` | Largest file one upload may be, in MB. |
| `FILES_MIN_FREE_MB` | `1024` | An upload is refused when it would leave less free space than this on the disk, in MB. |

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
