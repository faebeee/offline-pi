# AGENTS.md: conventions for offline-pi

offline-pi is **one app** meant to run offline on a host like a Raspberry Pi:
one Podman Compose project, one set of scripts, one `.env`, one port. It is
made of **modules** (maps, library, mesh, ...), each a container behind
**core**. Core is the **one API** (NestJS, one domain module per feature)
and serves the **one web app** (`apps/web`, React + TanStack), so the user
works with every module through a single UI. The code is a **Turborepo
monorepo on npm workspaces**: every module is an app in `apps/`, shared code
lives in `packages/`. Read this before adding a feature or a module or
touching the scripts.

## Layout

```
compose.yml              # the whole stack, project "offline-pi"
.env.example             # checked in; documents every var
.env                     # gitignored; written by install.sh only
install.sh               # choose + configure modules, build, then start.sh
start.sh                 # rebuild, (re)create containers; core starts modules
update.sh                # git pull a new version, then start.sh --pull
manage.sh                # status, start/stop, logs, module commands
uninstall.sh             # remove containers/images; data only on confirmation
lib/common.sh            # log helpers, compose wrapper, .env helpers
lib/storage.sh           # prompt_dir / resync_dir (relocatable data)
lib/serial.sh            # USB serial device picker (mesh)
lib/modules.sh           # module registry for the scripts, hooks, core_api
lib/migrate.sh           # adopts the old per-app layout (apps/*/.env)
lib/update.sh            # update.sh: git checks, incoming changes, new settings
lib/modules/<name>.sh    # per-module hooks (configure, prepare, manage, ...)
package.json             # npm workspaces root (apps/*, apps/maps/*, packages/*)
package-lock.json        # the one lockfile of every JS workspace
turbo.json               # Turborepo tasks: build, typecheck, dev
tsconfig.base.json       # shared TypeScript base config
.dockerignore            # images build with the repo root as context
apps/<name>/             # one module: Dockerfile, code, module.json, README
apps/core/               # the API (domains), passthrough, supervisor (always on)
apps/logs/               # a screen served by core: module.json + README only
apps/web/                # the web app: every screen of every module
apps/maps/backend/       # a module's container code (API, data, jobs)
packages/ui/             # @offline-pi/ui: Outpost design system (DESIGN.md)
packages/api-client/     # @offline-pi/api-client: generated from core's OpenAPI
packages/maps-shared/    # @offline-pi/maps-shared: maps container contract
host/hotspot-pi/         # host-level utility, no container (see below)
data/                    # gitignored default home of every *_DIR
```

## Monorepo (npm workspaces + Turborepo)

- JS workspaces are named `@offline-pi/<name>` and depend on each other with
  `"*"` (e.g. `"@offline-pi/ui": "*"`). Install once at the root
  (`npm install`); never add a lockfile inside a workspace.
- Every workspace with code has `build` (output in `dist/`), `typecheck`
  and, where it makes sense, `dev` scripts. `turbo.json` orders them
  (`^build` first), so `npm run build`, `npm run typecheck` and
  `npx turbo run dev --filter=<workspace>` work from the root.
- Modules without a JS build (mesh: Python, knowledge: kiwix, mesh-map: a
  dependency-free `server.mjs`) live in `apps/` without a `package.json`;
  npm and turbo ignore them.
- `@offline-pi/core` depends on `@offline-pi/web`, so `turbo prune
  @offline-pi/core` and `turbo run build --filter=@offline-pi/core` include
  the web app; core's image serves its `dist/`. The web app's packages are
  all `devDependencies` (Vite bundles them), so core's runtime image doesn't
  install them.
- **Images build with the repo root as context** (`compose.yml`:
  `context: .`, `dockerfile: apps/<name>/Dockerfile`), so they can use
  `packages/*` directly. Node images start with a `prune` stage
  (`turbo prune <workspace> --docker`), `npm ci` on the pruned
  `out/json/`, then `turbo run build` on `out/full/`. Keep the root
  `.dockerignore` excluding every data directory, `node_modules` and `dist`.

Host-level utilities without a container (e.g. `host/hotspot-pi`, a systemd
networking fallback) are documented on their own terms. One rule applies to
them too: **every installer has an uninstaller** that reverses it, following
the "never silently delete user data" rules of `uninstall.sh`.

## How it fits together

```
browser ──> core :8080
            ├─ /                 apps/web (SPA; /maps, /mesh, ... are its routes)
            ├─ /api/<domain>/*   core's API, one Nest domain module per feature
            ├─ /api/docs         Swagger UI (/api/openapi.json)
            ├─ /socket.io        live updates, one namespace per domain
            ├─ /ui/              @offline-pi/ui
            └─ /svc/<module>/*   passthrough to a module's raw files
core ──HTTP/WS──> maps :8081 · knowledge :8082 · mesh :8084 · mesh-map :8086
```

- **core** (`apps/core`, NestJS) is the only service the LAN reaches, on
  `PORT` (8080), and the **only thing the browser talks to**. It serves:
  - `/`: the web app (`apps/web`), with an `index.html` fallback for its
    client-side routes (`src/platform/web/web.ts`),
  - `/api/<domain>/*`: its API. Each feature is a **domain module** in
    `src/domains/<name>/` that talks to its module's container
    (see "Core: domains"),
  - `/socket.io`: one Socket.IO server, one namespace per domain
    (`/system`, `/maps`, `/mesh`); domains bridge their container's live
    feed (SSE, WebSocket) onto it,
  - `/svc/<module path>/`: a streaming passthrough to each installed module
    (`src/platform/passthrough/passthrough.ts`) for what is not JSON: map
    tiles, fonts, sprites, `.pmtiles` range requests, kiwix articles.
    WebSockets, SSE and range requests included,
  - `/ui/`: the shared Outpost package.
- **Modules** listen on `MODULES_BIND_ADDRESS` (127.0.0.1) on an internal
  port, so they are never exposed on their own. They have **no UI of their
  own**: an API, data and jobs. The browser only ever talks to one origin:
  no CORS, no ports in links.
- **Start/stop**: core talks to the user's `podman.socket` (libpod REST,
  `src/modules/podman.service.ts`). Which installed modules run is chosen
  on the dashboard and stored in `CORE_DATA_DIR/modules.json` (the modules
  switched *off*). Only core has `restart: always`; modules use
  `restart: on-failure`, so podman restarts a crash but not a stop. When
  core starts (after `./start.sh` or a reboot via `podman-restart.service`)
  it brings every module into its desired state (`ModulesService.reconcile`).
- **Installed vs running**: `MODULES` in `.env` (written by `install.sh`) is
  what gets built and has a container. The dashboard can only start
  installed modules; adding one means re-running `./install.sh`.

## Core: domains

Core is a **domain-driven** NestJS app. `src/platform/` is the shared kernel
(module registry and start/stop `ModulesService`, `PodmanService`,
`RuntimeService`, `UpstreamService`, passthrough, OpenAPI, web serving); it
has no feature logic. Every feature is one folder:

```
apps/core/src/domains/<name>/
  <name>.module.ts      # Nest module, imported in src/app.module.ts
  api/                  # <name>.controller.ts: routes under /api/<name>/
  application/          # use cases with logic (may combine domains)
  infrastructure/       # <name>.client.ts: talks to the container, mappers
  domain/               # <name>.dto.ts: the domain's model = the API contract
  <name>.events.ts      # Socket.IO namespace /<name> (optional)
```

- **Talking to a container**: `UpstreamService.client('<module id>')` gives
  an `UpstreamClient` (base URL from the manifest). It maps failures to the
  errors the web app expects: not installed 404, not running 503 (with
  `Retry-After`), upstream 4xx/5xx with the upstream message. Controllers may
  call the infrastructure client directly for 1:1 calls; anything with logic
  goes in `application/`.
- **The contract**: request and response types are **classes** in
  `*.dto.ts` files; the `@nestjs/swagger` CLI plugin (`nest-cli.json`) turns
  them, the controllers' return types and their doc comments into the OpenAPI
  document. No interfaces for API types (the plugin can't see them). Request
  DTOs need `class-validator` decorators (`ValidationPipe` whitelists).
  Map the container's shapes to the domain model in `infrastructure/`
  (e.g. mesh: snake_case -> camelCase).
- **Operation ids** are `<controller without "Controller"><Method>`
  (`MapsController.regions` -> `mapsRegions` -> `useMapsRegions()`), so name
  controller methods for the client.
- **Live updates**: a `*.events.ts` gateway with
  `@WebSocketGateway(socketOptions('/<name>'))`; register the payload classes
  with `registerEventModels(...)` and add the events to
  `packages/api-client/src/events.ts`.
- **The client**: `npm run api:gen` (root) builds core, writes
  `packages/api-client/openapi.json` (Nest preview mode, no containers
  needed) and runs orval: `src/generated/<tag>/` gets fetch functions, query
  keys and TanStack Query hooks, `src/generated/model/` every DTO. The
  generated files are checked in; regenerate after every API change.

### Adding a feature (endpoint -> screen)

1. In `apps/core/src/domains/<name>/`: the DTO classes, the client call, the
   controller method (and an application service if there is logic). A new
   domain: also its `<name>.module.ts` in `src/app.module.ts`.
2. `npm run api:gen`.
3. In `apps/web`: use the generated hook (`useXxx()` from
   `@offline-pi/api-client`) in `src/features/<name>/`, and a route in
   `src/routes/` if it is a new screen.

A feature may combine domains (e.g. mesh-map's overview uses the mesh
domain's client): import the other domain's Nest module and inject its
exported client or service. Never call another module's container from the
browser.

## Adding a module

1. `apps/<name>/` with a `Dockerfile` and the code. `<name>` is the
   compose service name, the container is `offline-pi-<name>`. A JS module
   is a workspace (`package.json` named `@offline-pi/<name>`, or nested
   workspaces like `apps/maps/backend`, added to the root `workspaces`);
   run `npm install` at the root to update the lockfile.
2. `apps/<name>/module.json`, **one key per line** (the shell scripts
   read it with `sed`, arrays on one line):

   ```json
   {
     "id": "<name>",
     "num": 6,
     "label": "Radio",
     "icon": "signal",
     "description": "One line for the home page tile.",
     "service": "<name>",
     "path": "/radio/",
     "portEnv": "RADIO_PORT",
     "stripPrefix": true,
     "health": "/api/status",
     "dirs": ["RADIO_DATA_DIR"],
     "optional": true,
     "requires": [],
     "dependsOn": []
   }
   ```

   - `path`: the module's route in the web app (`/radio/`); core's
     passthrough to the container is `/svc` + path (`/svc/radio/`).
     `stripPrefix: true` forwards `/svc/radio/x` as `/x`, `false` keeps the
     prefix (for servers that support a URL root, like kiwix's
     `--urlRootLocation=/svc/library`).
   - A screen core serves itself (System, Logs) has `"service": "core"`,
     no `portEnv` and `"optional": false`: no container, always on; its
     domain and screen are added as in steps 6 and 7.
   - `requires`: env vars that must be non-empty before it may start (e.g.
     `MESH_CONNECTION`, set by its configure hook). `dependsOn`: installed
     modules started with it.
   - `dirs`: its bind-mounted `*_DIR` vars (checked by `start.sh`).
   - core picks up the manifest at the next build (its Dockerfile copies
     every `apps/*/module.json` into the image; in development it reads them
     from the checkout): home tile, nav entry, start/stop, the upstream URL
     and the passthrough come from it.
3. A service block in `compose.yml` (see "Compose rules").
4. Its settings in `.env.example`, prefixed with the module name
   (`RADIO_PORT`, `RADIO_DATA_DIR`, ...), with the next free internal port.
5. Optional `lib/modules/<name>.sh` with hooks (dashes in the name become
   underscores, e.g. `mesh_map_configure`):
   - `<name>_configure`: install.sh, every run while installed: prompts,
     storage (`prompt_dir` + `resync_dir` + `set_env`), device checks.
   - `<name>_prepare`: before every build (install.sh, start.sh), for files
     the build needs that are not in the checkout (shared code is not one of
     them: images build from the repo root and use `packages/*` directly).
   - `<name>_post_build`: install.sh, after building (one-off setup).
   - `<name>_manage` / `<name>_usage`: `./manage.sh <name> <cmd>`; return 2
     for "unknown command" (prints the usage).
6. Its domain in core (`apps/core/src/domains/<name>/`, see "Core:
   domains") and its screen in the web app (`apps/web/src/routes/<path>.tsx`
   + `src/features/<name>/`, see "Web UI"). The container itself serves no
   UI.
7. A row in the root `README.md` module table and an `apps/<name>/README.md`.
8. Images and `*_DIR` vars in `uninstall.sh`'s config block.

## Scripts

Every script: `#!/usr/bin/env bash`, `set -euo pipefail`, and starts with:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"
```

then sources `lib/common.sh` (and what else it needs).

- **`install.sh`**: idempotent. Checks/offers to install podman and a
  compose backend (`ensure_podman`); creates `.env` from `.env.example` and
  asks for `PORT`/`BIND_ADDRESS` on first run only; adopts old `apps/*`
  installs (`migrate_old_apps`); asks which modules to install (every run,
  current choice as default); runs `core_configure` and each module's
  configure hook; detects the vcio device, Podman's storage root and socket
  (enables `podman.socket`); builds; runs post-build hooks;
  `ensure_autostart`; ends by `exec`'ing `start.sh`.
- **`start.sh`**: requires `.env` (`log_error "Run ./install.sh first."`,
  never prompts). Checks every `*_DIR` exists, runs prepare hooks, builds,
  `compose up -d --no-start --force-recreate <modules>`, removes containers
  of modules no longer installed, then `compose up -d --force-recreate core`
  (core starts the modules). `--force-recreate` is required: podman-compose
  only replaces a container when the compose config changed, not the image.
  Prints the local + LAN URL.
  `./start.sh --pull` also pulls newer base images, `--no-cache` ignores
  the layer cache.
- **`update.sh`** `[--check] [--yes] [--clean] [--rebuild]`: installs a new
  version. Requires `.env` and a git clone on a branch with an upstream and
  no local changes to tracked files; fetches, shows the incoming commits and
  touched modules, asks (default yes), `git merge --ff-only`, then re-runs
  the **new** `update.sh` (`--apply <old commit>`) so a changed update
  procedure applies to the same run. That half lists settings new in
  `.env.example` (it never writes `.env`: compose's `${VAR:-default}`
  covers them) and `exec`s `start.sh --pull` (`--no-cache` with
  `--clean`). Never discards local commits or changes; prints the
  `git reset --hard <old> && ./start.sh` way back.
- **`manage.sh`**: `status`, `start|stop <module>` (through core's API, so
  the dashboard state stays right), `logs [module]`, `<module> <cmd>`.
  Destructive commands confirm first and never silently delete data.
- **`uninstall.sh`** `[--purge] [--yes]`: works with or without `.env` and
  without Podman. Shows what it will do, asks once (default no). Always
  removes containers (`compose down` plus any `offline-pi-*` left) and the
  images. Every `*_DIR` is **kept by default**, shown with its size and only
  deleted after its own confirmation (or `--purge`); never `/`, `$HOME`,
  mount roots or anything containing the checkout. `.env` is removed only
  when all data was deleted (a missing dir counts as kept: the SSD may just
  be unplugged). Doesn't touch Podman, `podman-restart.service`, lingering
  or `podman.socket`. Uses plain `read` prompts.
- Only `install.sh` writes `.env` (`set_env`); `start.sh`/`manage.sh` read
  it. Core writes only `CORE_DATA_DIR/modules.json`.
- Every compose call goes through `compose` in `lib/common.sh`, which adds
  `-p offline-pi -f compose.yml --env-file .env` and prefers `podman compose`
  over `podman-compose`.

### Logging & prompts

```bash
log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
```

Plain `read -r -p` prompts with the default in brackets. Put logic in
`lib/*.sh` rather than growing the entry scripts.

## Podman, not Docker

- Always Podman Compose in scripts, docs and compose files, never
  `docker`/`docker-compose`.
- Rootless Podman. `podman-restart.service` (enabled by `ensure_autostart`,
  plus lingering) brings core back after a reboot; core brings the modules.

### Compose rules (`compose.yml`)

- `build: { context: ., dockerfile: apps/<name>/Dockerfile }`,
  `image: offline-pi-<name>`, `container_name: offline-pi-<name>`; or a
  pinned upstream image. The context is always the repo root (see
  "Monorepo"), so `COPY` paths in a Dockerfile start at the root
  (`COPY apps/<name>/app/ app/`).
- Every value `${VAR:-default}`, so `.env` is the single source of truth.
- `network_mode: host`, no `ports:`. The rootless bridge depends on a
  long-lived `aardvark-dns`/`pasta` pair that can get stuck after the host's
  network changes (Wi-Fi reconnect), breaking outbound requests until every
  container restarts. With host networking `PORT`/`HOST` env vars are the
  real bind address: modules bind `${MODULES_BIND_ADDRESS:-127.0.0.1}` on
  `${<NAME>_PORT}`, and healthchecks/code read the port from the environment.
  Dockerfile `CMD` in shell form if it expands `$PORT`/`$HOST`.
- `restart: on-failure` for modules, `always` only for core (see above).
- Healthchecks: `test: ["CMD-SHELL", "<command>"]`. podman-compose re-quotes
  `CMD` arrays into a broken shell string.
- Images running as a non-root user (e.g. `USER node`, uid 1000) can't
  write host-owned bind mounts under rootless Podman: set
  `userns_mode: "keep-id:uid=1000,gid=1000"`. The top-level
  `x-podman: { in_pod: false }` (already set) is required for that.
- External drives are often exFAT, which rejects chmod/chown with `EPERM`:
  copy with `rsync -a --no-perms --no-owner --no-group` or `cp -r` (not
  `cp -a`), and in app code avoid `fs.cp`/`fs.copyFile` onto such mounts.

## Persistent data & external storage

Every bind-mounted directory that can grow is relocatable through its own
`.env` variable, `<MODULE>_<PURPOSE>_DIR` (e.g. `MAPS_DATA_DIR`,
`KNOWLEDGE_CONTENT_DIR`), defaulting to `./data/<module>`; never a literal
path in `compose.yml`. That is what lets a user put data on an SSD instead of
the SD card.

- `compose.yml`: `- ${MAPS_DATA_DIR:-./data/maps}:/app/data`.
- `.env.example`: a comment per dir saying what grows there and to point it
  at the SSD (e.g. `/mnt/ssd/offline-pi/maps`).
- The module's configure hook re-prompts it on **every** `install.sh` run
  (`prompt_dir`, default = current value): expands to an absolute path,
  `mkdir -p`, checks it is writable, fails fast if not (SSD not mounted).
- When the answer differs, `resync_dir` treats it as "move my data here":
  confirm, copy (`rsync`, falling back to `cp -r`), remove the old copy,
  then `set_env`. If the copy fails, both copies stay and `.env` is left
  alone. An empty or missing old dir: just create the new one.
- List the vars in `module.json` `dirs`, in `uninstall.sh` and in the root
  README's config table.

## Web UI: one app, the Outpost design system

There is one UI: `apps/web` (`@offline-pi/web`), Vite + React + TanStack
Router (file routes) + TanStack Query, built into core's image and served
at `/`. It follows [`DESIGN.md`](DESIGN.md) and builds on
[`packages/ui`](packages/ui/README.md) (`@offline-pi/ui`: tokens,
self-hosted fonts, icon sprite, components, `outpost.js`), bundled by Vite.
Don't restyle components per feature; add missing ones to `packages/ui` with
tokens only and note them in the `DESIGN.md` changelog.

```
apps/web/src/
  main.tsx              # QueryClient, router
  routes/               # one file per screen (/, /system, /maps, /mesh, ...)
  features/<domain>/    # components, hooks and CSS of one domain
  app/                  # Screen (frame), strip, Nav, realtime, maplibre
  ui/outpost.tsx        # React wrappers for the Outpost package
```

- **Data only through `@offline-pi/api-client`**: generated hooks for REST
  (`useMapsRegions()`, ...), `useSocketEvent("/<domain>", ...)`
  (`src/app/realtime.ts`) for live updates, updating the Query cache. No
  hand-written `fetch` to `/api`, never a module's container directly; raw
  files (tiles, `.pmtiles`, kiwix pages) through `/svc/<module>/`.
- **Every screen** is `<Screen module="<id>" title=...>` (header with theme
  toggle, content, module nav; the status strip is shared) and, for a
  module, `<ModuleGate id="<id>">`, which shows "not installed / not
  running / START" instead of the screen. The nav and home tiles come from
  `/api/modules`, so a new module needs no change in `packages/ui`.
- Follow the status strip link rule in `packages/ui/README.md`
  (`useStripLink`): the LED is the screen's link to its own local data
  source, `<SOURCE> · <STATE>`.
- No runtime network requests: no CDNs, web fonts or remote icons.
- Dev: `npm run dev:core` (API on :8080) and `npm run dev:web` (Vite on
  :5173, proxies `/api`, `/socket.io`, `/svc`, `/ui` to core).

## Documentation

- Root `README.md`: what offline-pi is, quick start (`git clone`,
  `./install.sh`), the module table (path, internal port, description), the
  `.env` table, `manage.sh` usage, uninstall.
- `apps/<name>/README.md`: what the module does, its settings and
  `manage.sh <name>` commands, its architecture and development notes.
