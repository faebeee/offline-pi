# Monorepo and builds

The code is one Turborepo monorepo on npm workspaces. Every module is an app
in `apps/`, shared code lives in `packages/`, and there is one lockfile for
everything.

## Workspaces

The root `package.json` declares the workspaces `apps/*`, `apps/maps/*` and
`packages/*`.

| Workspace | Folder | What it is |
|---|---|---|
| `@outpost/core` | `apps/core` | The API, passthrough and supervisor (NestJS) |
| `@outpost/web` | `apps/web` | The web app (Vite, React, TanStack) |
| `@outpost/maps-backend` | `apps/maps/backend` | The maps container's code |
| `@outpost/ui` | `packages/ui` | Outpost design system (plain CSS and JS, no build) |
| `@outpost/api-client` | `packages/api-client` | Client generated from core's OpenAPI |
| `@outpost/maps-shared` | `packages/maps-shared` | The maps container's contract (types) |

Rules:

- Workspaces depend on each other with `"*"`, for example
  `"@outpost/ui": "*"`.
- Run `npm install` once at the root. Never add a lockfile inside a
  workspace; `package-lock.json` at the root is the only one.
- Modules without a JS build (mesh: Python; knowledge: kiwix; mesh-map: a
  dependency-free `server.mjs`) live in `apps/` without a `package.json`.
  npm and Turborepo ignore them.
- Core depends on the web app, so building core builds the web app first.
  The web app's packages are all `devDependencies` (Vite bundles them), so
  core's runtime image doesn't install them.

## Tasks

`turbo.json` defines three tasks. Each depends on `^build`, so the
workspaces a package depends on are built first.

| Task | Output | Notes |
|---|---|---|
| `build` | `dist/` | Cached by Turborepo |
| `typecheck` | | `tsc --noEmit` |
| `dev` | | Not cached, persistent (watch mode) |

## Root scripts

Run these from the project root.

| Command | What it does |
|---|---|
| `npm run build` | Build every workspace |
| `npm run typecheck` | Typecheck every workspace |
| `npm run dev:core` | Build and run core on `:8080` |
| `npm run dev:web` | Vite dev server for the web app on `:5173` |
| `npm run dev:maps` | The maps backend and `maps-shared` in watch mode |
| `npm run maps:setup` | First-run setup of the maps backend in the checkout |
| `npm run maps:assets:fetch` | Fetch the map fonts and sprites |
| `npm run api:gen` | Build core, write `packages/api-client/openapi.json`, regenerate the client |

Any workspace's dev task also works with
`npx turbo run dev --filter=<workspace>`.

## Images

Every image builds with the **repo root as context**: `compose.yml` uses
`context: .` and `dockerfile: apps/<name>/Dockerfile`. So a Dockerfile can
use `packages/*` directly, and `COPY` paths start at the root
(`COPY apps/<name>/app/ app/`).

Node images follow the same stages (see `apps/core/Dockerfile`):

1. **prune**: `turbo prune <workspace> --docker` cuts the monorepo down to
   the workspace and what it depends on. `out/json/` holds only the
   `package.json` files, `out/full/` the sources.
2. **build**: `npm ci` on `out/json/` (a cached layer while dependencies
   don't change), then the sources from `out/full/` and
   `turbo run build --filter=<workspace>`.
3. **runtime**: `npm ci --omit=dev --workspace <workspace>` and the built
   `dist/` folders only.

Core's image also copies every `apps/*/module.json` (the module manifests)
and the built web app. Other images use a pinned upstream base (kiwix-serve
for knowledge, Python for mesh, plain Node for mesh-map).

### .dockerignore

Because the context is the whole repo, the root `.dockerignore` keeps it
small. It must exclude every data directory (`data`, `apps/*/data`, ZIM
files, map assets), `node_modules`, `dist`, `.env` and things no image needs
(`lib`, `host`, `*.sh`). Add a module's data paths there when you add one.

## Local development

```bash
npm install          # once, at the root
npm run dev:core     # core on :8080
npm run dev:web      # web app on :5173, proxies /api, /socket.io, /svc, /ui to core
```

Open `http://localhost:5173`. Changes in `apps/web` reload at once; changes
in core need a restart of `dev:core`.

- Core reads Linux `/proc` and `/sys` for the System screen, so that screen
  needs a Linux host.
- Without Podman, point core at module processes by hand:
  `MODULES=maps MAPS_PORT=8081 npm run dev:core`, with
  `npm run dev:maps` next to it.
- `CORE_URL` points the dev server at another core, for example the Pi:
  `CORE_URL=http://raspberrypi.local:8080 npm run dev:web`.
- To test the real images, run `./start.sh` (it rebuilds what changed).
