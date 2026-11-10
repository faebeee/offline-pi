# offline-pi

One self-hosted app for a Raspberry Pi that keeps working without internet:
offline maps, an emergency-knowledge library, Meshtastic messaging and a live
map of the mesh, plus a dashboard for the Pi itself. Everything is reached on
one port, in one UI, and runs fully offline once set up (no CDN, no runtime
downloads).

## Modules

Core always runs; the other modules are chosen at install and switched on
and off on the dashboard.

| Module | Screen | API | Internal port | Description |
|---|---|---|---|---|
| Home | `/` | `/api/modules` | | Every installed module as a tile, with on/off switches. |
| [System](apps/core/README.md) (core) | `/system` | `/api/system` | `8080` (public) | Realtime Pi dashboard: temperature, input voltage, throttling, PSU limits, CPU, memory, storage, network, containers and connections. Core is also the API of every module and starts/stops them. |
| [Logs](apps/logs/README.md) (core) | `/logs` | `/api/logs` | | Log lines of core and every installed module, live, filterable by level and text, downloadable, for debugging. |
| [Maps](apps/maps/README.md) | `/maps` | `/api/maps` | `8081` | Self-hosted vector maps: download a region once, then pan, zoom and search with no internet connection. |
| [Mesh map](apps/mesh-map/README.md) | `/mesh-map` | `/api/mesh-map` | `8086` | Live map of the Meshtastic nodes heard by Mesh, on the regions downloaded in Maps (read-only). |
| [Mesh](apps/mesh/README.md) | `/mesh` | `/api/mesh` | `8084` | Messaging over a USB Meshtastic LoRa node: channel and direct messages, node list, history kept on the Pi. |
| [Library](apps/knowledge/README.md) | `/library` | `/api/library` | `8082` | Offline Wikipedia, medical and survival guides via `kiwix-serve`; you choose the books on the Library screen, the container downloads them itself. |

Modules listen on `127.0.0.1` only; the LAN sees just `PORT` (8080), where
core serves the one web app ([`apps/web`](apps/web/README.md)), the one API
(`/api/<domain>/`, Swagger UI at `/api/docs`) and a passthrough for module
files (`/svc/<module>/`: map tiles, kiwix articles).

[`host/hotspot-pi`](host/hotspot-pi) is a host-level extra (no container):
join a known Wi-Fi at boot or open a hotspot so phones can reach the Pi.

## Quick start

Requirements: a Raspberry Pi (or any Linux box) with Podman and a compose
backend (`install.sh` offers to install both via apt or dnf). A USB
Meshtastic node for Mesh; an SSD recommended for maps and library data.

```sh
git clone https://github.com/faebeee/offline-pi.git
cd offline-pi
./install.sh
```

Then open `http://<pi>:8080/`.

`install.sh` walks through five steps with arrow-key menus: a system check
(Podman, compose, Pi hardware), the web app (port, who can reach it, an
optional control PIN; asked on the first run, later only if you want to
change them), which modules to install (checkbox list), where each module
keeps its data plus module specifics (e.g. the Meshtastic USB device), and a
summary before it builds the images and runs `start.sh`. The build output
goes to `install.log`; on an error the installer shows its end.

```sh
./install.sh --yes       # no questions: keep the current answers (defaults on a first run)
./install.sh --plain     # line-by-line prompts instead of menus (also used without a terminal)
./install.sh --verbose   # show the build output instead of a progress line
```

Re-run `./install.sh` any time to add or remove modules, reconfigure one, or
move data to another disk: every data directory is asked again, defaulting to
the current location, and existing data is moved to the new one.

### macOS (development)

The same scripts run on a Mac (Bash 3.2 is enough). `install.sh` offers to
install Podman and `podman-compose` with [Homebrew](https://brew.sh) and to
create and start the Podman machine (the Linux VM Podman runs containers
in). Differences from a Pi:

- Compose always runs through `podman-compose` with
  [`compose.macos.yml`](compose.macos.yml) on top (the remote Podman API has
  no `keep-groups`).
- The containers' host network is the VM's: `start.sh` forwards `PORT` from
  the Mac into the machine on every start.
- Data directories must be under a path the machine shares (`/Users` by
  default).
- USB devices can't reach the VM: Mesh needs a node on the network (tcp).
- Nothing starts at login: after a restart run `podman machine start` and
  `./start.sh`.

### Upgrading from the per-app layout

Older versions had one stack per app under `apps/<name>/`. After
`git pull`, run `./install.sh` once: it reads each `apps/<name>/.env`, takes
over the settings and data locations (nothing is downloaded again), removes
the old containers and images, and renames the old files to `.env.migrated`.
The storage questions then offer to move the data out of `apps/`.

## Day to day

```sh
./update.sh                     # install a new version: git pull, rebuild every container
./update.sh --check             # only show whether a new version is available
./start.sh                      # rebuild + restart everything (after editing .env)
./manage.sh status              # every module: installed, running
./manage.sh start maps          # same as the switch on the home page
./manage.sh stop knowledge
./manage.sh logs [module]       # follow logs (default: core)
./manage.sh knowledge list      # module commands, see ./manage.sh help
./manage.sh mesh set-region EU_868
```

`update.sh` shows the new commits and which modules they touch, asks, then
fast-forwards the checkout and runs `start.sh --pull` (fresh base images,
every image rebuilt, every container recreated). Data and `.env` are kept;
settings a new version adds are listed with the defaults they get. It
refuses when tracked files have local changes, and prints the command to go
back to the previous version. `--clean` rebuilds without the layer cache,
`--rebuild` rebuilds even when up to date, `--yes` doesn't ask. A failed
build leaves the running containers on their old images.

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
| `CORE_LOG_LEVEL` | `log` | Least severe level core logs and the Logs screen shows for core (`debug` for more detail). |
| `CONTROL_PIN` | empty | PIN asked before starting/stopping modules on the dashboard. |
| `CORE_DATA_DIR` | `./data/core` | Dashboard history, power events, module on/off state. |
| `MAPS_DATA_DIR` | `./data/maps` | Map regions (GBs) and POIs. Point at the SSD. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Map fonts and sprites (~100 MB). |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | ZIM files chosen on the Library screen (MB to hundreds of GB). Point at the SSD. |
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
npm run dev:core       # the API on :8080 (and dev:maps for the maps container)
npm run dev:web        # the web app on :5173, proxied to core
npm run api:gen        # after changing core's API: OpenAPI + typed client
```

Core (`apps/core`, NestJS) has one domain module per feature
(`src/domains/<name>/`) that talks to its module's container; the web app
(`apps/web`, React + TanStack Router/Query) uses the client generated from
core's OpenAPI document (`packages/api-client`), so a new endpoint is one
`npm run api:gen` away from a typed hook in the UI. The UI follows the
Outpost design system: [`DESIGN.md`](DESIGN.md) is the spec and
[`packages/ui`](packages/ui/README.md) (`@offline-pi/ui`) the package.
[`AGENTS.md`](AGENTS.md) describes the architecture, how to add a feature
(domain, `api:gen`, screen) and how to add a module (an `apps/<name>/`
directory with a `module.json` manifest, a compose service and optional
install hooks).
