# Architecture

outpost is one app made of modules. One Podman Compose project runs one
container per module plus **core**. Core is the only thing the browser
talks to: it serves the web app, is the one API, and starts and stops the
modules.

## The picture

```text
browser ──> core :8080
            ├─ /                 apps/web (SPA; /maps, /mesh, ... are its routes)
            ├─ /api/<domain>/*   core's API, one Nest domain module per feature
            ├─ /api/docs         Swagger UI (/api/openapi.json)
            ├─ /socket.io        live updates, one namespace per domain
            ├─ /ui/              @outpost/ui
            └─ /svc/<module>/*   passthrough to a module's raw files
core ──HTTP/WS──> maps :8081 · knowledge :8082 · mesh :8084
core ──libpod REST──> the user's podman.socket (start/stop)
```

- Core listens on `PORT` (8080) at `BIND_ADDRESS`. Everything else listens on
  `MODULES_BIND_ADDRESS` (127.0.0.1) on its own internal port.
- Modules have **no UI of their own**: an API, data and jobs. Every screen is
  part of the web app.
- The browser only ever sees one origin: no CORS, no ports in links.
- Every container uses host networking (`network_mode: host`). The rootless
  bridge network can get stuck after the host's network changes, and host
  networking avoids that.

## Core: platform and domains

Core (`apps/core`, NestJS) has two parts:

| Part | Folder | What it holds |
|---|---|---|
| Platform | `src/platform/` | The shared kernel, no feature logic: module registry, `ModulesService` and `PodmanService` (start/stop), `RuntimeService` (container state), `UpstreamService` (calling a container), passthrough, OpenAPI, Socket.IO options, error filter, logging, serving the web app |
| Domains | `src/domains/<name>/` | One folder per feature: `modules`, `system`, `logs`, `info`, `maps`, `mesh`, `library`. Each has its routes under `/api/<name>/` |

`src/app.module.ts` imports the platform and every domain module. How a
domain is laid out is in [Core API](03-core-api.md).

## Module registry

Core reads every `apps/*/module.json` when it starts. The core image copies
all manifests in at build time; in development core reads them from the
checkout (`APPS_DIR` overrides where). From the manifests come the home page
tiles, the nav (`GET /api/modules`), each domain's upstream URL
(`http://MODULES_BIND_ADDRESS:<port from portEnv>`) and the passthrough
paths. A module is installed when it is listed in `MODULES`.

## Supervisor

Core starts and stops module containers through the libpod REST API on the
user's `podman.socket` (`src/platform/modules/podman.service.ts`). The
socket's host path is `PODMAN_SOCKET`, reached through the read-only
`/hostfs` mount (connecting to a socket works on a read-only mount).

- The modules switched **off** on the home page are stored in
  `CORE_DATA_DIR/modules.json`.
- When core starts (after `./start.sh`, or after a reboot through
  `podman-restart.service`), `ModulesService.reconcile` brings every
  installed module into its desired state: it starts the modules switched on
  whose `requires` are set, `dependsOn` first, and stops the ones switched
  off.
- Only core has `restart: always`. Modules have `restart: on-failure`, so
  Podman restarts a crash but not a stop from the web app.

The socket gives full control over the user's containers, so core only
exposes start and stop of module containers, behind the `X-Pi-Monitor`
header and the optional `CONTROL_PIN`.

## Passthrough

Some things a module serves are not JSON: map tiles, fonts, sprites,
`.pmtiles` range requests, kiwix articles. For those, core forwards
`/svc/<module path>/` to the module's port
(`src/platform/passthrough/passthrough.ts`).

- It is installed before the body parser, so request bodies pass untouched.
- It streams both ways: range requests, SSE and large downloads are not
  buffered. WebSocket upgrades are piped too.
- `stripPrefix: true` forwards `/svc/maps/x` as `/x`. `false` keeps the
  prefix, for servers that support a URL root (kiwix runs with
  `--urlRootLocation=/svc/library`).
- Modules learn their public prefix from `X-Forwarded-Prefix`.

## Live updates

One Socket.IO server on core's port, one namespace per domain (`/system`,
`/maps`, `/mesh`, `/logs`). A domain bridges its container's live feed (SSE
or WebSocket) onto its namespace, so the browser never connects to a
container. The events are typed in `packages/api-client/src/events.ts`.

## The web app

The web app (`apps/web`, React with TanStack Router and Query) is built into
core's image and served at `/` (`src/platform/web/web.ts`). Every page load
that asks for HTML and is not under `/api`, `/svc`, `/socket.io` or `/ui`
gets its `index.html`, so client-side routes such as `/mesh/nodes` survive a
reload. See [Web app](04-web-app.md).

## Host access

Core describes the Pi, not its container, so it runs with `pid: host`, mounts
`/` read-only at `/hostfs` (for `/sys`, mounted disks, Podman's state
database and socket) and maps the firmware mailbox (`VCIO_DEVICE`) for
`vcgencmd`. It runs as the container's root, which under rootless Podman is
your own unprivileged user.
