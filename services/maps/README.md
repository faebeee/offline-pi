# Offline Maps

Self-hosted vector map tiles with a browser viewer. Download a region once, then
pan and zoom with no internet connection.

Part of offline-pi: installed with the root `./install.sh` (pick `maps`) and
reached through core at `/maps/` on `PORT` (8080). Add a region from the UI:
setup, search, download and delete all happen in the browser. See the root
README for install, start and uninstall.

The UI is built on the shared Outpost design system in `ui/` in the repo root
(tokens, fonts, icons, frame and components, see `DESIGN.md`). The frontend
bundles a gitignored copy at `apps/frontend/src/outpost-ui/`, which the
module's prepare hook (`lib/modules/maps.sh`) refreshes before every build.
For `npm run dev` on a fresh clone, run that once yourself:

```sh
../../ui/sync.sh apps/frontend/src/outpost-ui
```

The frontend uses page-relative URLs, and the server builds the absolute
style URLs from core's `X-Forwarded-Prefix` header
(`apps/backend/src/common/public-base.ts`), so the same build works at
`/maps/` and standalone.

The basemap follows the UI theme (moon/sun button in the header): the night
theme always loads the `dark` style, the day theme `light`. Both are the
Protomaps flavors with their ground, water and boundaries tuned to the Outpost
tokens (`apps/backend/src/styles/style.service.ts`).

---

## How it works

Regions are extracted out of the global [Protomaps](https://protomaps.com) planet
build using HTTP range requests, so adding a city downloads only that city's
tiles — not the 130 GB planet file. Each region lands in
`$MAPS_DATA_DIR/regions/<name>.pmtiles` (`MAPS_DATA_DIR` defaults to
`./data/maps`; point it at an external SSD mount to keep large catalogs off
the SD card).

The backend serves tiles, a MapLibre style, glyphs and sprites, all from
the Pi. Nothing is fetched from a CDN at runtime, which is what makes the
viewer work with the network unplugged.

```
bin/pmtiles                       go-pmtiles CLI (installed on first run)
$MAPS_DATA_DIR/regions/*.pmtiles      one archive per region
$MAPS_DATA_DIR/regions.json           registry: bbox, zoom range, build date, size
$MAPS_DATA_DIR/offline-maps.db        default database: your points of interest
$MAPS_DATA_DIR/geofabrik-index.json   catalog of 554 named regions
$MAPS_ASSETS_DIR/fonts, .../sprites   vendored map assets
apps/backend/                     NestJS server + region CLI
apps/frontend/                    Vite + React + MapLibre viewer
packages/shared/                  types shared by server and viewer
```

The repo is an npm workspaces monorepo: `apps/*` are deployables, `packages/*`
are libraries consumed by them. `@offline-maps/shared` holds the `/api` contract
(`Region`, `Theme`, response shapes), so a registry change fails the typecheck on
both sides.

```sh
npm run build        # shared -> backend -> frontend
npm run typecheck    # every workspace
```

### Backend

A NestJS app on the Express adapter, compiled with `tsc` to `apps/backend/dist`
(decorator metadata rules out esbuild-based runners). Modules mirror the routes:

```
src/regions/    registry + open PMTiles handles; /api/regions, /tiles, /pmtiles
src/styles/     MapLibre style assembly; /api/styles
src/assets/     vendored glyphs and sprites; /fonts, /sprites
src/spa/        catch-all serving the built viewer (imported last, so it
                never shadows an API route)
src/places/     name -> boundary lookup; /api/places
src/pois/       points of interest; /api/pois
src/db/         TypeORM entities and migrations
src/jobs/       job registry + SSE stream; /api/jobs
src/downloads/  the add-a-region pipeline; /api/downloads
src/setup/      first-run bootstrap; /api/status, /api/setup
src/tools/      go-pmtiles binary wrapper
src/cli/        headless `setup` and `assets:fetch`, through
                NestFactory.createApplicationContext
```

Regions are managed from the UI, so the CLI only covers headless bootstrap
(`npm run setup`). It shares the server's providers rather than duplicating
them.

## Adding regions

Open the panel (layers button on the map), press **ADD REGION** and search for a city, state or country. Names
resolve against the Geofabrik catalog first (exact administrative borders, 554
entries); anything it doesn't cover falls back to OpenStreetMap's Nominatim, so
ambiguous names come back as a list to pick from:

```
Austin   Travis County, Texas, United States · 0.38° × 0.42°
Austin   Mower County, Minnesota · 0.13° × 0.07°
```

Selecting one outlines it on the map. Pick a detail level, and the exact cost is
measured with a real `pmtiles extract --dry-run` before anything downloads:

```
Archive        To download     Planet build
741 MB         779 MB          20261026
```

Confirm and the extract runs with live progress; cancelling at any point kills
it and removes the partial archive. Rough sizes at the default zoom 15: a city
like Berlin is ~65 MB, a country like Switzerland ~750 MB. Each level down
roughly halves that.

Deleting is the trash button on a region row, then a hold-to-confirm button (hold for 3 s, or hold Space/Enter).

Only one download runs at a time — a second request gets a `409`. Jobs live in
memory, so restarting the server drops them; any half-written archive is swept
on the next boot.

## Points of interest

Right-click the map, long-press on touch, or use **SAVE PLACE AT MAP CENTRE** in
the panel's Places tab to drop a pin, then give it a name. Markers are square
"saved place" markers with a mono label, and they are draggable: let go and
the new position is saved.

The Places tab lists the POIs inside the current viewport and shows how many
are outside it. Clicking one flies to it and opens its editor, which also
deletes it (hold to confirm).

The API still stores an `emoji` per POI. The UI follows the Outpost design
system, which uses no emoji, so it neither shows nor edits it: new places get
the default and edits keep the existing value.

POIs are global, not owned by a region. They are stored in `$MAPS_DATA_DIR/offline-maps.db`
so deleting or re-downloading the region they sit in leaves them alone, and a
POI near a border shows up on every region that covers it.

### Storage

POIs go through [TypeORM](https://typeorm.io), so the engine is a configuration
choice rather than something baked into the queries. The default is a sqlite
file at `$MAPS_DATA_DIR/offline-maps.db`, which is what a self-hosted install
wants and which is persisted along with the archives.

To move to Postgres, set `MAPS_DATABASE_URL` in the root `.env` and restart
(`DATABASE_URL` inside the container) — nothing else
changes, and the migrations run themselves on boot:

```sh
DATABASE_URL=postgres://maps:secret@localhost:5432/maps npm start
```

Both drivers ship with the backend (`better-sqlite3`, `pg`). better-sqlite3
publishes N-API prebuilds, so there is still nothing to compile and the
container image keeps installing with `--ignore-scripts`.

Keeping that promise honest costs a little discipline:

- Entities and migrations are listed explicitly in `src/config/database.ts` —
  TypeORM's glob loading does not work under ESM.
- Column types are ones every dialect agrees on. `uuid` becomes a native uuid on
  Postgres and a `varchar` on sqlite; `@CreateDateColumn` becomes `timestamp`
  and `datetime`. The migration picks those few spellings off the connection at
  run time instead of hardcoding SQL.
- Primary keys are generated with `randomUUID()` in the service, not by a column
  default — Postgres would need `gen_random_uuid()` and sqlite has no equivalent.
- `synchronize` is off. Schema changes are migrations, which run on boot.

```sh
npm run -w @offline-maps/backend migration:show      # what has been applied
npm run -w @offline-maps/backend migration:run       # apply pending (also automatic on boot)
npm run -w @offline-maps/backend migration:revert    # undo the last one
```

## Running

```sh
npm run dev                 # backend :8081 + Vite :5173, both reloading
npm run build && npm start  # single server on :8081
```

Backend dev runs `tsc --watch` next to `node --watch dist/main.js`, so a saved
`.ts` file restarts the server.

### In offline-pi

The service `maps` in `compose.yml` in the repo root runs as container
`offline-pi-maps` (image `localhost/offline-pi-maps`) with host networking,
listening on `127.0.0.1:MAPS_PORT`; only core's gateway is reachable from
the LAN. `./install.sh` builds the image and runs the first-run setup
(pmtiles binary, fonts, sprites); the same by hand:

```sh
podman compose run --rm --no-deps maps node apps/backend/dist/cli/main.js setup
```

Start/stop it with the switch on the home page or
`./manage.sh start|stop maps`; follow its log with `./manage.sh logs maps`.

## Configuration

Set in the root `.env` (see the root README):

| Variable | Default | Description |
|---|---|---|
| `MAPS_DATA_DIR` | `./data/maps` | Regions, the POI db and the registry. Point at an SSD mount for large catalogs. |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Vendored fonts and sprites (~100 MB). |
| `MAPS_PORT` | `8081` | Internal port (loopback only), proxied by core at `/maps/`. |
| `MAPS_ALLOWED_ORIGINS` | empty | Extra origins allowed to call `/api`. |
| `MAPS_DATABASE_URL` | empty | Empty uses sqlite in `MAPS_DATA_DIR`; a `postgres://` URL uses Postgres. |
| `MAPS_DB_LOGGING` | `false` | `true` logs every SQL statement. |

Re-running `./install.sh` re-asks both directories and moves existing
regions, POIs and assets to a new path (e.g. a newly mounted SSD).
`./uninstall.sh` keeps them unless you confirm deleting them.

## API

| Route | Purpose |
|---|---|
| `GET /api/regions` | Registry of downloaded regions |
| `GET /api/styles/_all.json` | MapLibre style with **every** region as its own source. What the viewer loads. `?theme=…` (the viewer sends `dark` or `light`, following the UI theme) |
| `GET /api/styles/:region.json` | MapLibre style for one region. `?theme=light\|dark\|white\|grayscale\|black` |
| `GET /tiles/:region/:z/:x/:y.mvt` | Vector tile |
| `GET /pmtiles/:region.pmtiles` | Raw archive, with HTTP range support |
| `GET /fonts/:fontstack/:range.pbf` | Glyphs |
| `GET /sprites/*` | Sprite sheets |

Region management:

| Route | Purpose |
|---|---|
| `GET /api/status` | What first-run setup still has to do |
| `POST /api/setup` | Install the pmtiles binary, vendor fonts and sprites |
| `GET /api/places?q=` | Candidate boundaries for a place name |
| `POST /api/downloads` | Start a download; parks on an estimate |
| `POST /api/downloads/:id/confirm` | Accept the estimate, run the extract |
| `GET /api/jobs`, `GET /api/jobs/:id` | Job state |
| `GET /api/jobs/:id/events` | Server-sent progress stream |
| `DELETE /api/jobs/:id` | Cancel a job, or decline an estimate |
| `DELETE /api/regions/:name` | Delete an archive and its registry entry |
| `GET /api/pois` | Points of interest; `?bbox=minLon,minLat,maxLon,maxLat` to limit |
| `POST /api/pois` | Create one from `{ name, emoji, lat, lon }` |
| `PATCH /api/pois/:id` | Update any subset of those fields |
| `DELETE /api/pois/:id` | Delete one |

Map data (`/tiles`, `/pmtiles`, `/fonts`, `/sprites`) is readable from any
origin so QGIS and the pmtiles CLI keep working. `/api` is not: it answers only
the origin that served the viewer, and mutating requests are additionally
rejected when `Sec-Fetch-Site` says cross-site — otherwise any page you visit
could start a 50 GB download on your disk. Set `MAPS_ALLOWED_ORIGINS` (comma
separated) if you front it with something unusual.

Tiles are stored gzipped and stream through uncompressed-on-demand: clients that
send `Accept-Encoding: gzip` get the stored bytes untouched, others get them
decompressed.

The `/pmtiles/` route serves proper `206 Partial Content` responses, so the
archive can be opened directly by other tools over HTTP:

```sh
pmtiles show http://<pi>:8080/maps/pmtiles/berlin.pmtiles
```

QGIS can add the same URL as a vector tile layer.

## Offline guarantees

Internet is needed exactly twice: the one-time setup, and each region download.
Everything the viewer loads afterwards — tiles, style, glyphs, sprites, the app
bundle and MapLibre's web worker — is served from the Pi.

To verify, disconnect from the network and reload the page. The map must render
fully. A CDN dependency sneaking into the style is the usual way this breaks.

## Attribution

Map data © [OpenStreetMap](https://openstreetmap.org/copyright) contributors,
tiles by [Protomaps](https://protomaps.com), styles from
[@protomaps/basemaps](https://github.com/protomaps/basemaps), fonts and sprites
from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets)
(fonts under the SIL Open Font License).
