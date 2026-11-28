# AGENTS.md: conventions for outpost

outpost is **one app** meant to run offline on a host like a Raspberry Pi:
one Podman Compose project, one set of scripts, one `.env`, one port. It is
made of **modules** (maps, library, network, ...), each a container behind
**core**. Core is the **one API** (NestJS, one domain module per feature)
and serves the **one web app** (`apps/web`, React + TanStack), so the user
works with every module through a single UI. The code is a **Turborepo
monorepo on npm workspaces**: every module is an app in `apps/`, shared code
lives in `packages/`. Read this before adding a feature or a module or
touching the scripts.

## Layout

```
compose.yml              # the whole stack, project "outpost"
compose.macos.yml        # added on macOS (lib/common.sh): what the remote API lacks
.env.example             # checked in; documents every var
.env                     # gitignored; written by install.sh only
get.sh                   # one-line install: installs git, clones, runs install.sh
install.sh               # choose modules + data folder, get images, autostart, start.sh
start.sh                 # get images, (re)create containers; core starts modules
stop.sh                  # stop core, then every module (nothing removed)
update.sh                # git pull a new version, then its install.sh --yes
manage.sh                # status, start/stop, logs, users, module commands
uninstall.sh             # remove containers/images; data only on confirmation
lib/common.sh            # log helpers, compose wrapper, .env helpers
lib/ui.sh                # prompts: inputs, menus, checkboxes, spinner (ui_*)
lib/platform.sh          # Linux/macOS differences, Bash 3.2 stand-ins
lib/install.sh           # install.sh's steps (host check, basics, modules)
lib/storage.sh           # the data folder(s): storage_configure, prompt_dir, resync_dir
lib/images.sh            # get_images: download the commit's images or build them
lib/autostart.sh         # outpost.service: start at boot (systemd user unit)
lib/modules.sh           # module registry for the scripts, hooks, core_api
lib/migrate.sh           # adopts the old per-app layout, offline-pi -> outpost
lib/update.sh            # update.sh: git checks, versions, incoming changes, new settings
lib/modules/<name>.sh    # per-module hooks (configure, post_build, manage, ...)
package.json             # npm workspaces root (apps/*, apps/maps/*, packages/*)
package-lock.json        # the one lockfile of every JS workspace
turbo.json               # Turborepo tasks: build, typecheck, dev
tsconfig.base.json       # shared TypeScript base config
.dockerignore            # images build with the repo root as context
.github/workflows/images.yml # CI: every service's image per commit, to ghcr.io
apps/<name>/             # one module: Dockerfile, code, module.json, README
apps/core/               # the API (domains), passthrough, supervisor (always on)
apps/logs/               # a screen served by core: module.json + README only
apps/diagnostics/        # the same: troubleshooting checks (core domain diagnostics)
apps/info/               # the docs screen, served by core (reads docs/)
apps/files/              # the shared folder, served by core (domain files)
apps/supplies/           # the supplies list, served by core (domain supplies)
apps/board/              # the notice board, served by core (domain board)
apps/users/              # the accounts screen, served by core (domain users, admins only)
apps/web/                # the web app: every screen of every module
apps/landing/            # the project's landing page (static, not on the Pi)
apps/maps/backend/       # a module's container code (API, data, jobs)
packages/ui/             # @outpost/ui: Outpost design system (DESIGN.md)
packages/api-client/     # @outpost/api-client: generated from core's OpenAPI
packages/maps-shared/    # @outpost/maps-shared: maps container contract
host/hotspot-pi/         # host-level utility, no container (see below)
host/network-guard/      # host-level: enforces the network module's block list (root)
host/hotspot-name/       # host-level: <name>.local on the hotspot (avahi + dnsmasq, root)
host/usb-storage/        # host-level: automount a USB drive (fstab + udev)
docs/                    # the documentation (Markdown chapters), shown by Info
data/                    # gitignored default home of every *_DIR
```

## Monorepo (npm workspaces + Turborepo)

- JS workspaces are named `@outpost/<name>` and depend on each other with
  `"*"` (e.g. `"@outpost/ui": "*"`). Install once at the root
  (`npm install`); never add a lockfile inside a workspace.
- Every workspace with code has `build` (output in `dist/`), `typecheck`
  and, where it makes sense, `dev` scripts. `turbo.json` orders them
  (`^build` first), so `npm run build`, `npm run typecheck` and
  `npx turbo run dev --filter=<workspace>` work from the root.
- Modules without a JS build (network: Python, knowledge: kiwix) live in
  `apps/` without a `package.json`; npm and turbo ignore them.
- `@outpost/core` depends on `@outpost/web`, so `turbo prune
  @outpost/core` and `turbo run build --filter=@outpost/core` include
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
            ├─ /                 apps/web (SPA; /maps, /library, ... are its routes)
            ├─ /api/<domain>/*   core's API, one Nest domain module per feature
            ├─ /api/docs         Swagger UI (/api/openapi.json)
            ├─ /socket.io        live updates, one namespace per domain
            ├─ /ui/              @outpost/ui
            └─ /svc/<module>/*   passthrough to a module's raw files
core ──HTTP/WS──> maps :8081 · knowledge :8082 · network :8085
```

- **core** (`apps/core`, NestJS) is the only service the LAN reaches, on
  `PORT` (8080), and the **only thing the browser talks to**. It serves:
  - `/`: the web app (`apps/web`), with an `index.html` fallback for its
    client-side routes (`src/platform/web/web.ts`),
  - `/api/<domain>/*`: its API. Each feature is a **domain module** in
    `src/domains/<name>/` that talks to its module's container
    (see "Core: domains"),
  - `/socket.io`: one Socket.IO server, one namespace per domain
    (`/system`, `/maps`, `/logs`); domains bridge their container's live
    feed (SSE, WebSocket) onto it,
  - `/svc/<module path>/`: a streaming passthrough to each installed module
    (`src/platform/passthrough/passthrough.ts`) for what is not JSON: map
    tiles, fonts, sprites, `.pmtiles` range requests, kiwix articles.
    WebSockets, SSE and range requests included. **Read only** (GET/HEAD;
    anything else is 405) and without the browser's cookie or token: the
    containers trust whatever reaches them, so every change goes through
    core's API, where login, role and CSRF header are checked,
  - `/ui/`: the shared Outpost package.

  Everything under `/api/` and `/svc/` and every Socket.IO connection needs
  a login (see "Accounts and login").
- **Modules** listen on `MODULES_BIND_ADDRESS` (127.0.0.1) on an internal
  port, so they are never exposed on their own. They have **no UI of their
  own**: an API, data and jobs. The browser only ever talks to one origin:
  no CORS, no ports in links.
- **Start/stop**: core talks to the user's `podman.socket` (libpod REST,
  `src/modules/podman.service.ts`). Which installed modules run is chosen
  on the dashboard and stored in `CORE_DATA_DIR/modules.json` (the modules
  switched *off*). Every service, core included, uses
  `restart: on-failure`: podman restarts a crash but not a stop (no
  `restart: always`, so `podman-restart.service` skips outpost). **At
  boot** the systemd user unit `outpost.service` (`lib/autostart.sh`,
  enabled by `install.sh`, with lingering) runs `start.sh --boot`, which
  starts the existing core container. When core starts it brings every
  module into its desired state (`ModulesService.reconcile`).
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
  (e.g. network: snake_case -> camelCase).
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

### Accounts and login

The whole app needs a login; each account is an `admin` or a `user`. User
guide: `docs/03-modules/14-users.md`.

- **Kernel** `src/platform/auth/`: `UsersStore` (`CORE_DATA_DIR/users.json`,
  scrypt hashes in `password.ts`), `SessionsStore` (`sessions.json`, only
  the SHA-256 of each token; 30 days), `AuthService.resolve()` (session
  cookie `outpost_session`, httpOnly, SameSite=Strict, or the bearer
  token), `authMiddleware` (401 for `/api/` and `/svc/` without a session;
  a `/svc/` page load redirects to `/`), `AuthIoAdapter` (Socket.IO),
  `@CurrentUser()` param decorator. The three files (with `cli.token`) are
  mode 600 (`JsonFile` takes an optional file mode).
- **Domain** `src/domains/users/`: `AuthController` (`/api/auth`: state,
  setup, login, logout, password) and `UsersController` (`/api/users`,
  admins only).
- **Security rules** (each one closed a real hole once):
  - the rules in `auth.middleware.ts` compare `rulePath()` (lower case,
    slashes collapsed), and routing is case-sensitive (`main.ts`): never
    match a raw `req.path` against a prefix;
  - a container's API is never reachable from the browser except through a
    core domain: the passthrough is read only (see above);
  - a check followed by an `await` and then a write must check again after
    the `await` (`UsersStore.create`: the first-run setup and duplicate
    names), and a rate limit counts an attempt when it starts;
  - every answer gets `X-Frame-Options: SAMEORIGIN`, `nosniff` and
    `Referrer-Policy: same-origin`; the auth API `no-store`.
- **New endpoints are protected by default.** Only add to the public list
  in `auth.middleware.ts` what the login screen needs. A module marked
  `"admin": true` is admin only as a whole (see the manifest).
- **Guards** in `platform/http/control-guard.ts`: `assertCsrf(piMonitor)`
  (the `X-Pi-Monitor: 1` header on every state-changing call),
  `assertControl(piMonitor, user)` (CSRF + admin, for control actions:
  module start/stop, devices and the hotspot, deleting shared data,
  pinning posts, accounts), `assertAdmin(user)` (admin-only reads). An
  admin-only method takes `@Headers('x-pi-monitor') piMonitor` and
  `@CurrentUser() user: SessionUser | undefined` and calls
  `assertControl(piMonitor, user)`; a user gets 403 "Only an admin can do
  this."
- **Scripts**: core writes a random local admin token to
  `CORE_DATA_DIR/cli.token` at start and accepts it only from a loopback
  peer (`isLocalPeer`); `core_api` (`lib/modules.sh`) sends it as
  `Authorization: Bearer`, the whole request as a curl config on stdin (no
  secret in `ps`), on macOS through `podman machine ssh` so it is local.
- **First run**: while no account exists, core keeps a one-time setup code
  in `CORE_DATA_DIR/setup.code` (and logs it); `POST /api/auth/setup`
  needs it (braked like logins), `start.sh` prints it, `./manage.sh users
  setup-code` shows it.
- **Web**: `apps/web/src/app/auth.tsx`: `AuthGate` (wraps the frame in
  `routes/__root.tsx`, shows the first-run setup or the login),
  `useMe()` (`{ user, isAdmin }`, to disable admin-only actions),
  `AccountButton` (in every header). `main.tsx` refetches the auth state
  on any 401.

### Adding a feature (endpoint -> screen)

1. In `apps/core/src/domains/<name>/`: the DTO classes, the client call, the
   controller method (and an application service if there is logic). A new
   domain: also its `<name>.module.ts` in `src/app.module.ts`. An
   admin-only action calls `assertControl` (see "Accounts and login").
2. `npm run api:gen`.
3. In `apps/web`: use the generated hook (`useXxx()` from
   `@outpost/api-client`) in `src/features/<name>/`, and a route in
   `src/routes/` if it is a new screen.

A feature may combine domains: import the other domain's Nest module and
inject its exported client or service. A screen may also use another
domain's hooks and namespaces (e.g. a Maps layer drawn from another domain's
`useXxx()` hook and its Socket.IO namespace). Never call another module's container from the browser.

## Adding a module

1. `apps/<name>/` with a `Dockerfile` and the code. `<name>` is the
   compose service name, the container is `outpost-<name>`. A JS module
   is a workspace (`package.json` named `@outpost/<name>`, or nested
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
     "port": 8089,
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
   - A screen core serves itself (System, Logs, Board) has
     `"service": "core"`, no `portEnv` and `"optional": false`: no
     container, always on; its domain and screen are added as in steps 6
     and 7. A feature whose data is small and needs no program or device
     of its own belongs here, with its data in `CORE_DATA_DIR`.
   - `admin`: optional, `true` makes the screen admins only (System, Logs,
     Settings, Diagnostics, Users): hidden from users' nav and tiles
     (`adminOnly` in `/api/modules`), its route wrapped in `<AdminOnly>`
     (`apps/web/src/app/AdminOnly.tsx`), and core refuses `/api/<id>/...`
     and the Socket.IO namespace `/<id>` to non-admins (`authMiddleware`,
     `AuthIoAdapter`). Exceptions for every account go in `ANY_ACCOUNT` in
     `auth.middleware.ts` (`/api/system/vitals`, the status strip).
   - `nav`: `"apps"` (top of the nav) or `"system"` (the bottom group);
     default: optional modules are apps, core screens system. Board is a
     core screen with `"nav": "apps"`.
   - `port`: the default internal port, the same as in `.env.example`
     and `compose.yml`. Core uses it when `portEnv` is not in `.env`
     (`install.sh` writes `.env` once, so an older install lacks the
     variables of modules added later).
   - `requires`: env vars that must be non-empty before it may start (e.g.
     `RADIO_DEVICE`, set by its configure hook). `dependsOn`: installed
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
   underscores, e.g. `field_radio_configure`):
   - `<name>_configure`: install.sh, every run while installed: prompts
     that are really needed (Network: whether to install its host
     helper), device checks. Not the data folders: `storage_configure` (`lib/storage.sh`)
     sets every `*_DIR` listed in `dirs`, before the hooks run. Ask
     anything optional only with `INSTALL_ADVANCED=true` (`--advanced`).
   - `<name>_post_start`: install.sh, last of all, after start.sh: what
     may cut the connection (Network switches the hotspot here).
   - `<name>_post_build`: install.sh, once the images are there (one-off
     setup). An image must build from the checkout alone: CI builds it.
   - `<name>_manage` / `<name>_usage`: `./manage.sh <name> <cmd>`; return 2
     for "unknown command" (prints the usage).
6. Its domain in core (`apps/core/src/domains/<name>/`, see "Core:
   domains") and its screen in the web app (`apps/web/src/routes/<path>.tsx`
   + `src/features/<name>/`, see "Web UI"). The container itself serves no
   UI.
7. A row in the root `README.md` module table and an `apps/<name>/README.md`,
   plus its user page in `docs/03-modules/` and a row in the module table
   of `docs/01-overview/README.md`.
8. Its `*_DIR` vars in `uninstall.sh`'s config block, its name in the
   image pattern there, and the service in both matrices of
   `.github/workflows/images.yml`.

**Or inside core.** A feature whose data is small and that needs no
program, device or host access of its own (Board, Supplies, Files) is a
domain of core, not a container: `apps/<name>/module.json` with
`"service": "core"`, `"optional": false`, `"nav": "apps"` and no
`portEnv`; its data in `CORE_DATA_DIR` through `JsonFile`
(`src/platform/storage/json-file.ts`), or a `*_DIR` of its own mounted into
core when it grows (Files: `FILES_DATA_DIR`). Steps 1 (manifest only), 6 and
7 apply. Fewer containers make installs faster and simpler; prefer this.

## Scripts

Every script: `#!/usr/bin/env bash`, `set -euo pipefail`, and starts with:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"
```

then sources `lib/common.sh` (and what else it needs).

- **`get.sh`**: `curl -fsSL .../get.sh | bash` (arguments go to
  install.sh). Refuses root, installs git (apt/dnf/brew), clones to
  `~/outpost` (`OUTPOST_HOME`) or reuses that clone, `exec`s `install.sh`
  with `/dev/tty` as stdin. All in `main()`, so a cut-off download runs
  nothing.
- **`install.sh`** `[--advanced] [--yes] [--build] [--no-cache] [--plain]
  [--verbose]`: idempotent, four steps, **as few questions as possible**.
  1. System check: offers to install podman and a compose backend
  (`ensure_podman`: apt/dnf, Homebrew on macOS plus the Podman machine);
  creates `.env` from `.env.example`; adopts old `apps/*` installs
  (`migrate_old_apps`); detects the vcio device, Podman's storage root and
  socket (enables `podman.socket`). 2. Which modules to install
  (checkboxes, current choice as default). 3. One data folder
  (`OUTPOST_DATA_DIR`; `storage_configure` puts every `*_DIR` in it under
  its default name and moves existing data), then each module's configure
  hook. 4. A summary, `get_images`, post-build hooks, `ensure_linger`,
  `autostart_enable`, `exec start.sh`. `--advanced` adds the port,
  `BIND_ADDRESS`, a folder per `*_DIR` and a confirmation before
  installing; the defaults (8080, every device) are otherwise used without
  asking. Accounts are not asked: the first visit to the web app creates
  the admin (`start.sh` prints a reminder while none exists).
- **Images** (`lib/images.sh`): compose names them
  `$OUTPOST_REGISTRY/outpost-<service>:$OUTPOST_TAG`, the tag being
  `sha-<commit>` of the checkout (`images_init` in `lib/common.sh`, run by
  `compose`), `sha-<commit>-local` with local changes. CI
  (`.github/workflows/images.yml`) publishes amd64 + arm64 images of every
  commit on main and every tag. `get_images` pulls each one (`podman pull`:
  podman-compose skips services with a `build:`) and builds only what is
  missing, or everything with `--build`/`OUTPOST_BUILD=true`/local changes.
  `start.sh` then removes images of other versions (`remove_old_images`).
- **`start.sh`** `[--build] [--no-cache] [--boot]`: requires `.env`
  (`log_error "Run ./install.sh first."`, never prompts). Checks every
  `*_DIR` exists (`active_dir_vars`; with `--boot` it waits up to 2 min for
  a drive to mount), `get_images`,
  `compose up -d --no-start --force-recreate <modules>`, removes containers
  of modules no longer installed and the containers and images of retired
  modules (`retired_modules` in `lib/modules.sh`, e.g. files, now part
  of core), then `compose up -d --force-recreate core`
  (core starts the modules). `--force-recreate` is required: podman-compose
  only replaces a container when the compose config changed, not the image.
  On macOS it starts the Podman machine if needed and forwards `PORT` from
  the Mac into it (`macos_expose_port`). Waits until core answers, then
  prints the local + LAN URL. Output of the steps goes to `start.log` (or
  `install.log` when run by install.sh).
  `--boot` (outpost.service) only `podman start`s the existing core
  container; without one it does a full start.
- **`stop.sh`**: stops the running `outpost-*` containers, core first (so
  it can't start a module meanwhile), with plain `podman stop`: nothing is
  removed and `modules.json` is untouched, so `./start.sh` restores the
  same state. Needs no `.env`; on macOS a stopped machine means stopped.
- **`update.sh`** `[--check] [--yes] [--clean] [--rebuild]`: installs a new
  version. Requires `.env` and a git clone on a branch with an upstream and
  no local changes to tracked files; fetches, shows the incoming commits and
  touched modules, asks (default yes), `git merge --ff-only`, then re-runs
  the **new** `update.sh` (`--apply <old commit>`) so a changed update
  procedure applies to the same run. That half lists settings new in
  `.env.example` and `exec`s the new `install.sh --yes` (`--no-cache` with
  `--clean`), which keeps every answer, places new `*_DIR`s in the data
  folder and gets the new images. Never discards local commits or changes; prints the
  `git reset --hard <old> && ./start.sh` way back.
- **`manage.sh`**: `status`, `start|stop <module>` (through core's API, so
  the dashboard state stays right), `logs [module]`, `autostart
  on|off|status`, `users` (accounts and roles), `users reset-password
  NAME` (hidden prompt twice, logs the account out everywhere; the way back
  from a forgotten admin password), `<module> <cmd>`.
  Destructive commands confirm first and never silently delete data.
- **`uninstall.sh`** `[--purge] [--yes]`: works with or without `.env` and
  without Podman. Shows what it will do, asks once (default no). Always
  removes containers (`compose down` plus any `outpost-*` left) and the
  images. Every `*_DIR` is **kept by default**, shown with its size and only
  deleted after its own confirmation (or `--purge`); never `/`, `$HOME`,
  mount roots or anything containing the checkout. `.env` is removed only
  when all data was deleted (a missing dir counts as kept: the SSD may just
  be unplugged). Removes `outpost.service` (start at boot). Doesn't touch
  Podman, `podman-restart.service`, lingering or `podman.socket`. Uses
  plain `read` prompts.
- Only `install.sh` writes `.env` (`set_env`); `start.sh`/`manage.sh` read
  it. Core writes to `CORE_DATA_DIR` (`modules.json`, `history.json`,
  `board.json`, `supplies.json`, `users.json`, `sessions.json`,
  `cli.token`) and the Files folder (`FILES_DATA_DIR`).
- Every compose call goes through `compose` in `lib/common.sh`, which adds
  `-p outpost -f compose.yml --env-file .env` and prefers `podman compose`
  over `podman-compose`. On macOS it always uses `podman-compose` (`podman
  compose` may hand over to Docker Compose, which resolves bind mounts such
  as `/` on the Mac, not in the VM) and adds `-f compose.macos.yml`.

### Logging & prompts

```bash
log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
```

Prompts go through `lib/ui.sh` (sourced by `lib/common.sh`), never a bare
`read`: `ui_input QUESTION DEFAULT [VALIDATOR]`, `ui_secret QUESTION`
(hidden input, fails with `--yes`), `ui_confirm QUESTION y|n`,
`ui_select QUESTION DEFAULT "value|label|hint"...`, `ui_multiselect
QUESTION "value|label|hint|on"...` (answers in `UI_REPLY`), `ui_run MESSAGE
CMD...` for long steps (spinner, output to `UI_LOG`, its end shown on
failure; stdin is `/dev/null`, so nothing run by it may prompt). They draw on
stderr, so they work inside `$(...)`, fall back to plain `read` prompts
without a terminal (or `UI_PLAIN=true`, `--plain`) and take every default
with `UI_ASSUME_YES=true` (`--yes`). Put logic in `lib/*.sh` rather than
growing the entry scripts.

### Portability (Raspberry Pi OS and macOS)

The scripts run on a Pi/Linux and on a Mac, whose `/bin/bash` is 3.2 and
whose tools are BSD. Check with `/bin/bash -n` and avoid: `mapfile`/
`readarray` (`read_lines` in `lib/platform.sh`), associative arrays
(`declare -A`; use `case` functions), `${var,,}`, namerefs, fractional
`read -t`, `sed -i` (`set_env` uses awk), `stat -c` (`file_group`),
`hostname -I` (`lan_ip`). Branch on `is_macos` / `is_pi` for host
specifics (apt vs brew, systemd, devices). Never `producer | grep -q` under
`pipefail`: grep exiting early fails the pipeline at random.

## Podman, not Docker

- Always Podman Compose in scripts, docs and compose files, never
  `docker`/`docker-compose`.
- Rootless Podman. outpost starts at boot through its own systemd user
  unit (`outpost.service`, `./manage.sh autostart off` to stop that);
  lingering (`ensure_linger`) makes the user's systemd run at boot and keeps
  outpost running after a logout. Never use `restart: always` or enable
  `podman-restart.service`.
- macOS (development): Podman runs in a VM (`podman machine`). The
  containers' host network, `/`, the Podman socket and storage root
  (`PODMAN_*` in `.env`) are the VM's; `*_DIR`s must be under a path the
  machine shares (`/Users`); no USB devices. A setting Linux needs that the
  remote API rejects goes into `compose.macos.yml` (e.g.
  `group_add: !reset []`), not into `compose.yml`.

### Compose rules (`compose.yml`)

- `build: { context: ., dockerfile: apps/<name>/Dockerfile }`,
  `image: ${OUTPOST_REGISTRY:-ghcr.io/faebeee}/outpost-<name>:${OUTPOST_TAG:-local}`
  (see "Images"), `container_name: outpost-<name>`; or a pinned upstream
  image. The context is always the repo root (see
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
- `restart: on-failure` for every service, core included (see above).
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
- `.env.example`: a comment per dir saying what grows there; its default
  `./data/<name>` also gives its name inside the data folder.
- `install.sh` asks for **one** data folder on every run
  (`OUTPOST_DATA_DIR`, `storage_configure`; `prompt_dir`, default = current
  value: expands to an absolute path, `mkdir -p`, checks it is writable,
  fails fast if not, e.g. SSD not mounted) and sets every `*_DIR` of
  `active_dir_vars` to `<folder>/<name>`. A `*_DIR` set elsewhere by hand
  is left alone. `--advanced` asks for each `*_DIR` instead.
- When a location changes, `resync_dir` treats it as "move my data here":
  confirm, copy (`rsync`, falling back to `cp -r`), remove the old copy,
  then `set_env`. If the copy fails, both copies stay and `.env` is left
  alone. An empty or missing old dir: just create the new one.
- List the vars in `module.json` `dirs`, in `uninstall.sh` and in the root
  README's config table.

## Web UI: one app, the Outpost design system

There is one UI: `apps/web` (`@outpost/web`), Vite + React + TanStack
Router (file routes) + TanStack Query, built into core's image and served
at `/`. It follows [`DESIGN.md`](DESIGN.md) and builds on
[`packages/ui`](packages/ui/README.md) (`@outpost/ui`: tokens,
self-hosted fonts, icon sprite, components, `outpost.js`), bundled by Vite.
Don't restyle components per feature; add missing ones to `packages/ui` with
tokens only and note them in the `DESIGN.md` changelog.

```
apps/web/src/
  main.tsx              # QueryClient, router
  routes/               # one file per screen (/, /system, /maps, /library, ...)
  features/<domain>/    # components, hooks and CSS of one domain
  app/                  # Screen (frame), strip, Nav, realtime, maplibre
  ui/outpost.tsx        # React wrappers for the Outpost package
```

- **Data only through `@outpost/api-client`**: generated hooks for REST
  (`useMapsRegions()`, ...), `useSocketEvent("/<domain>", ...)`
  (`src/app/realtime.ts`) for live updates, updating the Query cache. No
  hand-written `fetch` to `/api`, never a module's container directly; raw
  files (tiles, `.pmtiles`, kiwix pages) through `/svc/<module>/`.
- **Every screen** is `<Screen module="<id>" title=...>` (header with the
  account button and theme toggle, content, module nav; the status strip is shared) and, for a
  module, `<ModuleGate id="<id>">`, which shows "not installed / not
  running / START" instead of the screen. The nav and home tiles come from
  `/api/modules`, so a new module needs no change in `packages/ui`. The
  whole frame is behind `AuthGate`; disable admin-only actions with
  `useMe().isAdmin`.
- The status strip is **the same on every screen** (`src/app/strip.tsx`):
  the link to core, internet (`NET`), the host vitals and the UTC time. Screens don't add to
  it; a screen's own state (its data source, counts, progress) goes in its
  context line or a banner.
- No runtime network requests: no CDNs, web fonts or remote icons.
- Dev: `npm run dev:core` (API on :8080) and `npm run dev:web` (Vite on
  :5173, proxies `/api`, `/socket.io`, `/svc`, `/ui` to core).

## Documentation

- `docs/`: the project documentation, for users and developers, in
  chapters (`docs/NN-chapter/README.md` + `NN-page.md`). Plain Markdown
  that reads well without the app; the Info module renders it. Relative
  links to other `.md` files in `docs/` only, one `# ` title per file, no
  raw HTML. A change to a feature, setting, command or module updates its
  page here too (see `docs/06-development/09-documentation.md`).
- `docs/07-changelog.md`: the changelog (see "Versioning & changelog").
- Root `README.md`: what outpost is, quick start (`git clone`,
  `./install.sh`), the module table (path, internal port, description), the
  `.env` table, `manage.sh` usage, uninstall.
- `apps/<name>/README.md`: what the module does, its settings and
  `manage.sh <name>` commands, its architecture and development notes.

## Versioning & changelog

One version for the whole app: `version` in the root `package.json`
(SemVer). The changelog is `docs/07-changelog.md` (shown by Info, linked
from the root README). Details: `docs/06-development/10-releases.md`.

- **Every change keeps the changelog current.** Add one line per notable
  change under `## Unreleased`, in `### Added` / `### Changed` /
  `### Fixed` / `### Removed`, in the same change as the code. Write for
  the person running outpost (what changed, what they must do); no commit
  hashes. Pure refactorings and docs-only edits need no line.
- **Never make a release on your own.** No version bump, no dated
  changelog section, no tag, unless the maintainer explicitly asks for a
  new version. Collecting lines under `## Unreleased` is not a release.
- **When asked for a release**: pick the version from the unreleased
  changes (or use the one given), rename `## Unreleased` to
  `## <version> (<YYYY-MM-DD>)` and add a fresh empty `## Unreleased`
  ("Nothing yet.") above it, check the list against
  `git log v<last>..HEAD`, set `version` in the root `package.json`, run
  `npm install` (lockfile), commit as `Release <version>`. Tag
  (`git tag -a v<version>`) and push only when asked.
- Workspace `package.json` versions (`apps/*`, `packages/*`) are not the
  app's version; leave them alone.
