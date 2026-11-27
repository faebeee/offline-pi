# Adding a module

A module is a feature with its own container behind core: an API, data and
jobs, but no UI of its own. Its screen is part of the web app, its API is a
domain in core. This page lists every step, using a made-up module `radio`
as the example.

Before you start, read [Architecture](01-architecture.md).

**First ask whether it needs a container.** A feature with small data and
no program, device or host access of its own (Board, Supplies, Files) is
better a domain of core: no image to build or download, nothing to install.
Its manifest has `"service": "core"`, `"optional": false`, `"nav": "apps"`
and no `portEnv`; it keeps its data in `CORE_DATA_DIR` through `JsonFile`
(`apps/core/src/platform/storage/json-file.ts`), or in a `*_DIR` of its own
mounted into core when the data grows (Files). For such a screen, skip
steps 1, 3, 4, 5 and 8 and see the note in step 2.

## 1. The code

Create `apps/radio/` with a `Dockerfile` and the code.

- `radio` is the compose service name; the container is `outpost-radio`.
- A JS module is a workspace: a `package.json` named `@outpost/radio`
  (or nested workspaces like `apps/maps/backend`, added to the root
  `workspaces`). Run `npm install` at the root to update the lockfile.
- A module in another language has no `package.json`; npm and Turborepo
  ignore it.
- The image builds with the repo root as context, so `COPY` paths start at
  the root. Node images use the prune, build and runtime stages described in
  [Monorepo and builds](02-monorepo-and-builds.md#images).
- Listen on the address and port from the environment (`HOST`, `PORT`),
  and serve a health endpoint.

## 2. The manifest

`apps/radio/module.json`, with **one key per line** (the shell scripts read
it with `sed`) and arrays on one line:

```json
{
  "id": "radio",
  "num": 8,
  "label": "Radio",
  "icon": "signal",
  "description": "One line for the home page tile.",
  "service": "radio",
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

| Field | Meaning |
|---|---|
| `id` | Module id used by the API, the web app (`<ModuleGate id>`) and `/api/modules` |
| `num` | Number in the nav and the header label; take the next free one |
| `label` | Name shown on tiles, in the nav and in messages |
| `icon` | Icon name from the Outpost sprite (`packages/ui/icons.svg`) |
| `description` | One line for the home page tile and the installer's list |
| `service` | Compose service name, also the folder name in `apps/` |
| `path` | The screen's route in the web app; the passthrough is `/svc` + path |
| `portEnv` | The `.env` variable with the internal port |
| `port` | The default internal port (same as in `.env.example` and `compose.yml`), used when `portEnv` is missing from an older `.env` |
| `stripPrefix` | `true`: `/svc/radio/x` is forwarded as `/x`. `false`: the prefix is kept, for servers with a URL root (kiwix) |
| `health` | Health path on the module |
| `dirs` | Its bind-mounted `*_DIR` variables, checked by `start.sh` |
| `optional` | `true` for a module the user chooses in `install.sh` |
| `requires` | Variables that must be non-empty before it may start (radio: `RADIO_DEVICE`) |
| `dependsOn` | Installed modules started together with it, first |

A screen that core serves itself has `"service": "core"`, no `portEnv` and
`"optional": false`: no container, always on.

Core picks the manifest up at its next build (its Dockerfile copies every
`apps/*/module.json`); in development it reads the checkout. The home tile,
nav entry, start/stop, upstream URL and passthrough all come from it.

## 3. Compose

A service block in `compose.yml`:

```yaml
  radio:
    build:
      context: .
      dockerfile: apps/radio/Dockerfile
    image: ${OUTPOST_REGISTRY:-ghcr.io/faebeee}/outpost-radio:${OUTPOST_TAG:-local}
    container_name: outpost-radio
    network_mode: host
    environment:
      PORT: ${RADIO_PORT:-8089}
      HOST: ${MODULES_BIND_ADDRESS:-127.0.0.1}
    volumes:
      - ${RADIO_DATA_DIR:-./data/radio}:/app/data
    restart: on-failure
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS -o /dev/null http://127.0.0.1:$${PORT:-8089}/api/status || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
```

The rules:

- Every value is `${VAR:-default}`; `.env` is the single source of truth.
- `network_mode: host`, no `ports:`. The module binds
  `MODULES_BIND_ADDRESS` on its own port. A Dockerfile `CMD` that expands
  `$PORT` or `$HOST` uses the shell form.
- `restart: on-failure` (like core: nothing may start on its own at boot).
- Health checks as `CMD-SHELL`: podman-compose breaks `CMD` arrays.
- Data in a relocatable `*_DIR`, never a literal host path.
- An image running as a non-root user (for example `USER node`, uid 1000)
  needs `userns_mode: "keep-id:uid=1000,gid=1000"` to write its bind mounts.
- Data may live on exFAT drives, which reject `chmod` and `chown`: copy
  with `rsync -a --no-perms --no-owner --no-group` or `cp -r`, and avoid
  `fs.cp` and `fs.copyFile` onto them in app code.

## 4. Settings

Add the module's settings to `.env.example`, prefixed with its name, with
the next free internal port and a comment for each:

```bash
# ------------------------------------------------------------------ radio --
# /radio/: what it does. Internal port.
RADIO_PORT=8089
# What grows here. Point at your SSD, e.g. /mnt/ssd/outpost/radio.
RADIO_DATA_DIR=./data/radio
```

Add its data paths to `.dockerignore` if they can be inside the checkout,
and the service to both `matrix.service` lists of
`.github/workflows/images.yml`, so its image is published for every commit.
The Dockerfile must build from the checkout alone.

## 5. Hooks

Optional: `lib/modules/radio.sh` with functions named after the service
(dashes become underscores, for example `field_radio_configure` for `field-radio`):

| Hook | When it runs | For |
|---|---|---|
| `radio_configure` | `install.sh`, every run while installed | Questions it can't run without, device checks. Its data folders are already set (`dirs` in the manifest); optional questions only with `INSTALL_ADVANCED=true` |
| `radio_post_build` | `install.sh`, once the images are there | One-off setup |
| `radio_manage` / `radio_usage` | `./manage.sh radio <cmd>` | Module commands; return 2 for an unknown command |

See [Scripts](08-scripts.md) for the conventions.

## 6. The domain in core

`apps/core/src/domains/radio/`: DTOs, a client through
`UpstreamService.client('radio')`, the controller, and `radio.module.ts`
imported in `src/app.module.ts`. Then `npm run api:gen`. Details in
[Core API](03-core-api.md).

## 7. The screen

`apps/web/src/routes/radio.tsx` and `apps/web/src/features/radio/`, with
`<Screen module="radio">` and `<ModuleGate id="radio">`. See
[Web app](04-web-app.md). The nav and the home tile need no change.

## 8. Uninstall

Add the `*_DIR` variables to `DATA_DIR_VARS` and the service to the image
pattern (`grep -E '/outpost-(core|maps|...)'`) in the configuration block
at the top of `uninstall.sh`.

## 9. Developer docs

A row in the module table of the root `README.md`, and an
`apps/radio/README.md`: what it does, its settings, its `manage.sh radio`
commands, its architecture and development notes.

## 10. User docs

Document the module for users in these docs:

- A new numbered page in `docs/03-modules/` (for example `09-radio.md`),
  listed in the chapter's [README](../03-modules/README.md).
- A row in the module table of [Overview](../01-overview/README.md).
- Its settings in [Settings](../05-reference/01-settings.md), its port,
  container and mounts in
  [Paths and ports](../05-reference/02-paths-and-ports.md), its endpoints in
  [API](../05-reference/03-api.md).

How to write and add pages is in [Documentation](09-documentation.md).
