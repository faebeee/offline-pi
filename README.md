# offline-pi

One self-hosted app for a Raspberry Pi that keeps working without internet:
offline maps, an emergency-knowledge library, Meshtastic messaging and a live
map of the mesh, plus a dashboard for the Pi itself. Everything is reached on
one port, in one UI, and runs fully offline once set up (no CDN, no runtime
downloads).

## Modules

Core always runs; the other modules are chosen at install and switched on
and off on the dashboard.

| Module | Path | Internal port | Description |
|---|---|---|---|
| Home | `/` | | Every installed module as a tile, with on/off switches. |
| [System](apps/core/README.md) (core) | `/system/` | `8080` (public) | Realtime Pi dashboard: temperature, input voltage, throttling, PSU limits, CPU, memory, storage, network, containers and connections. Core also serves the other modules (gateway) and starts/stops them. |
| [Maps](apps/maps/README.md) | `/maps/` | `8081` | Self-hosted vector maps: download a region once, then pan, zoom and search with no internet connection. |
| [Mesh map](apps/mesh-map/README.md) | `/mesh-map/` | `8086` | Live map of the Meshtastic nodes heard by Mesh, on the regions downloaded in Maps (read-only). |
| [Mesh](apps/mesh/README.md) | `/mesh/` | `8084` | Web UI for a USB Meshtastic LoRa node: channel and direct messages, node list, history kept on the Pi. |
| [Library](apps/knowledge/README.md) | `/library/` | `8082` | Offline Wikipedia, medical and survival guides via `kiwix-serve`; the container downloads the ZIM set from `zims.txt` itself. |

Modules listen on `127.0.0.1` only; the LAN sees just `PORT` (8080), where
core serves `/`, `/system/` and proxies every module under its path.

[`host/hotspot-pi`](host/hotspot-pi) is a host-level extra (no container):
join a known Wi-Fi at boot or open a hotspot so phones can reach the Pi.

## Quick start

Requirements: a Raspberry Pi (or any Linux box) with Podman and a compose
backend (`install.sh` offers to install both via apt). A USB Meshtastic node
for Mesh; an SSD recommended for maps and library data.

```sh
git clone https://github.com/faebeee/offline-pi.git
cd offline-pi
./install.sh
```

Then open `http://<pi>:8080/`.

`install.sh` asks for the port and bind address (first run), which modules to
install, where each module keeps its data, and module specifics (e.g. the
Meshtastic USB device). It builds the images and ends by running `start.sh`.

Re-run `./install.sh` any time to add or remove modules, reconfigure one, or
move data to another disk: every data directory is asked again, defaulting to
the current location, and existing data is moved to the new one.

### Upgrading from the per-app layout

Older versions had one stack per app under `apps/<name>/`. After
`git pull`, run `./install.sh` once: it reads each `apps/<name>/.env`, takes
over the settings and data locations (nothing is downloaded again), removes
the old containers and images, and renames the old files to `.env.migrated`.
The storage questions then offer to move the data out of `apps/`.

## Day to day

```sh
./start.sh                      # rebuild + restart everything (after git pull or editing .env)
./manage.sh status              # every module: installed, running
./manage.sh start maps          # same as the switch on the home page
./manage.sh stop knowledge
./manage.sh logs [module]       # follow logs (default: core)
./manage.sh knowledge list      # module commands, see ./manage.sh help
./manage.sh mesh set-region EU_868
```

Switching a module off on the dashboard stops its container; it stays off
after a reboot until it is switched on again. A crashed module is restarted
by Podman.

## Configuration (`.env`)

`install.sh` writes `.env` from [`.env.example`](.env.example), which
documents every variable. The main ones:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | The one port on the LAN: dashboard and all modules. |
| `BIND_ADDRESS` | `0.0.0.0` | `0.0.0.0` for LAN/hotspot, `127.0.0.1` for this Pi only. |
| `MODULES` | `maps,knowledge,mesh-map` | Installed modules (set by `install.sh`). |
| `CONTROL_PIN` | empty | PIN asked before starting/stopping modules on the dashboard. |
| `CORE_DATA_DIR` | `./data/core` | Dashboard history, power events, module on/off state. |
| `MAPS_DATA_DIR` | `./data/maps` | Map regions (GBs) and POIs. Point at the SSD. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Map fonts and sprites (~100 MB). |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | ZIM files (tens of GB). Point at the SSD. |
| `MESH_DATA_DIR` | `./data/mesh` | Message history. |
| `MESH_CONNECTION` / `MESH_DEVICE` / `MESH_HOST` | | How Mesh reaches the node (set by `install.sh`). |
| `*_PORT` | `8081`... | Internal (loopback) port of each module. |

Edit `.env` and run `./start.sh` to apply a change; storage paths are changed
with `./install.sh` so the data moves along.

## Uninstall

```sh
./uninstall.sh            # asks before deleting anything
./uninstall.sh --purge    # also deletes every data directory and .env
```

Always removes the containers and images. Each data directory is kept unless
you confirm deleting it (or pass `--purge`), and `.env` stays as long as any
data does, so `./install.sh` picks it up again. Podman, `podman-restart.service`,
lingering and `podman.socket` are left alone.

## Design and development

The code is a Turborepo monorepo on npm workspaces: every module is an app
in `apps/`, shared code lives in `packages/`. For development, install once
at the root and let Turborepo order the builds:

```bash
npm install            # every JS workspace, one package-lock.json
npm run build          # turbo run build (packages first)
npm run typecheck
npm run dev:maps       # or dev:core, dev:mesh-map (turbo run dev --filter=...)
```

All UIs share the Outpost design system: [`DESIGN.md`](DESIGN.md) is the spec
and [`packages/ui`](packages/ui/README.md) (`@offline-pi/ui`) the package every
module builds from.
[`AGENTS.md`](AGENTS.md) describes the architecture and how to add a module
(an `apps/<name>/` directory with a `module.json` manifest, a compose
service and optional install hooks; core picks up the rest).
