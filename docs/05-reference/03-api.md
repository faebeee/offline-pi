# API

Core is the one API of outpost. The web app uses nothing else, and you
can call it yourself, for example with `curl` from the Pi. Every feature is a
domain with its routes under `/api/<domain>/`.

The full, typed contract is the OpenAPI document:

- **Swagger UI**: `http://<pi>:8080/api/docs`, to read and try every
  endpoint in the browser.
- **OpenAPI JSON**: `http://<pi>:8080/api/openapi.json`. The same document
  is checked in as `packages/api-client/openapi.json`, from which the web
  app's client is generated.

The tables below are an overview. Paths are relative to `/api/`.

## modules

Which modules are installed, switched on and running, and starting or
stopping them.

| Method | Path | What it does |
|---|---|---|
| `GET` | `modules` | Every module with its state, whether start/stop is available and whether a PIN is required |
| `POST` | `modules/:id/start` | Start a module; the choice survives reboots |
| `POST` | `modules/:id/stop` | Stop a module; it stays off after a reboot |

The `POST` routes need the header `X-Pi-Monitor: 1`, and `X-Control-Pin`
when `CONTROL_PIN` is set (see [Control headers](#control-headers)).

## system

| Method | Path | What it does |
|---|---|---|
| `GET` | `system/status` | Cheap liveness check used by core's health check: `503` when sampling stalled |
| `GET` | `system/snapshot` | The latest snapshot of the Pi (`null` right after start), including `internet` (outgoing internet: `online`, `offline`, `checking`, `disabled`) |
| `GET` | `system/history` | One point per minute for 24 h, and the power events |

## logs

| Method | Path | What it does |
|---|---|---|
| `GET` | `logs/sources` | Core and every installed module, with its container state |
| `GET` | `logs/:source?tail=` | The last lines of one source (`core` or a module id), oldest first; `tail` default 500, at most 5000 |

## maps

| Method | Path | What it does |
|---|---|---|
| `GET` | `maps/status` | What the first-run setup still has to do |
| `POST` | `maps/setup` | Start the first-run setup (pmtiles, fonts, sprites, catalogue) |
| `GET` | `maps/regions` | The downloaded regions |
| `DELETE` | `maps/regions/:name` | Delete a region |
| `GET` | `maps/places?q=` | Candidate boundaries for a new region (Geofabrik index, Nominatim) |
| `POST` | `maps/downloads` | Estimate a download; the job waits in `awaiting-confirmation` |
| `POST` | `maps/downloads/:id/confirm` | Confirm a download |
| `GET` | `maps/jobs` | Every job |
| `GET` | `maps/jobs/:id` | One job |
| `DELETE` | `maps/jobs/:id` | Cancel a running job, or decline one waiting for confirmation |
| `GET` | `maps/pois?bbox=` | Saved places, optionally in a bounding box |
| `POST` | `maps/pois` | Save a place |
| `PATCH` | `maps/pois/:id` | Change a saved place |
| `DELETE` | `maps/pois/:id` | Delete a saved place |
| `GET` | `maps/styles/:name?theme=` | MapLibre style for one region, or `_all` for every region; sources point at `/svc/maps/` |

## library

| Method | Path | What it does |
|---|---|---|
| `GET` | `library/books` | Every installed book, by title |
| `GET` | `library/catalog` | The books on offer, which are selected and which are installed |
| `PUT` | `library/selection` | Replace the selection: unselected books are deleted, new ones download in the background |
| `GET` | `library/sync` | Whether selected books are being downloaded, and how far |
| `POST` | `library/sync` | Download missing selected books now (or newer versions); runs in the background |
| `GET` | `library/search?q=&bookId=&lang=&start=&pageLength=` | Full-text search in one book (`bookId`) or every book of one language (`lang`) |
| `GET` | `library/emergency` | The "In an emergency" topics, the language they are searched in and the emergency starter set |
| `GET` | `library/emergency/:topic` | The best article for one topic in the installed books (cached for 10 minutes) |

## files

| Method | Path | What it does |
|---|---|---|
| `GET` | `files/status` | Size of the shared folder, free space, upload limits |
| `GET` | `files/list?path=` | One folder, folders first |
| `POST` | `files/folders` | Make a folder |
| `POST` | `files/move` | Rename or move a file or folder |
| `DELETE` | `files/entries?path=` | Delete a file, or a folder with everything in it (control PIN) |

The bytes have their own routes (not in the OpenAPI document):
`GET files/raw/<path>` downloads (`?download=true` as an attachment; HTML,
SVG and other files a browser could run are always attachments, with range
requests), `PUT files/raw/<path>` uploads the request body as
`application/octet-stream` (`?overwrite=true` replaces a file; needs
`X-Pi-Monitor: 1`).

## board

| Method | Path | What it does |
|---|---|---|
| `GET` | `board/status` | Posts per kind, open and done |
| `GET` | `board/posts?kind=&includeDone=` | Every post: pinned first, done last |
| `POST` | `board/posts` | Add a post (`notice`, `need`, `offer` or `checkin`) |
| `PATCH` | `board/posts/:id` | Change a post or mark it done; changing `pinned` needs the control PIN |
| `DELETE` | `board/posts/:id` | Delete a post (control PIN) |

## supplies

| Method | Path | What it does |
|---|---|---|
| `GET` | `supplies/status` | Counts, warnings and how many days the water lasts |
| `GET` | `supplies/items` | Every item, by category and name |
| `POST` | `supplies/items` | Add an item |
| `PATCH` | `supplies/items/:id` | Change an item |
| `POST` | `supplies/items/:id/adjust` | Add to or take from its quantity |
| `DELETE` | `supplies/items/:id` | Delete an item (control PIN) |
| `GET` | `supplies/settings` | People, water per day, target days, expiry warning |
| `PUT` | `supplies/settings` | Change them |

## info

These docs, for the Info screen.

| Method | Path | What it does |
|---|---|---|
| `GET` | `info` | Every page in reading order, for the chapter navigation |
| `GET` | `info/page?slug=` | One page's Markdown, with the pages before and after it |
| `GET` | `info/search?q=` | Pages whose title or text contains every word of the query |

## settings

The configuration, read only (only `install.sh` writes `.env`).

| Method | Path | What it does |
|---|---|---|
| `GET` | `settings` | Every `.env` variable with its comment and default from `.env.example` (PINs, passwords, tokens and database URLs only as "set"), and every `*_DIR` with its path on the Pi, drive and free space |
| `GET` | `settings/sizes` | Disk usage of every `*_DIR`, like `du`; measured on request and kept for 5 minutes |

## diagnostics

Troubleshooting checks, read only.

| Method | Path | What it does |
|---|---|---|
| `GET` | `diagnostics` | Runs every check (setup, modules, storage, host) and returns each with `status` (`ok`, `info`, `warn`, `fail`), a summary, details and a fix; parallel requests share one run |

## Live updates

Socket.IO on `/socket.io`, one namespace per domain. The payloads are the
same DTOs as in the OpenAPI document.

| Namespace | Core sends | The browser sends |
|---|---|---|
| `/system` | `init` on connect (history, the last 15 minutes, the latest snapshot), then `snapshot` per sample | |
| `/maps` | `job` on every change of a watched job, until it is done, failed or cancelled | `watchJob` / `unwatchJob` with a job id |
| `/logs` | `entries` (new lines of a followed source, in batches), `followError` (the stream failed or ended) | `follow` / `unfollow` with a source (`core` or a module id) |

## Errors

Errors are JSON with `statusCode` and `message`. For a module's domain:

| Status | Meaning |
|---|---|
| `404` | The module is not installed (`message` says to run `./install.sh`) |
| `503` | The module's container is not running. Always with `Retry-After` (5 seconds unless the module says otherwise). |
| `504` | The module did not answer in time (15 seconds by default) |
| other `4xx`/`5xx` | The module's own error, with its status and message |

A request body that fails validation answers `400`. Unknown fields are
dropped.

## Control headers

Starting and stopping modules gives access to the user's Podman, and some
actions delete shared data, so core guards them:

| Header | Required | Why |
|---|---|---|
| `X-Pi-Monitor: 1` | On every call that changes something (`POST`, `PUT`, `PATCH`, `DELETE`) of modules, network, files, board and supplies | Another web page can't send it with a plain form post (CSRF guard). Missing: `400`. |
| `X-Control-Pin` | When `CONTROL_PIN` is set, on control actions: module start/stop, blocking devices and the hotspot switch, deleting shared files, board posts and supplies, pinning posts | Wrong or missing: `403`. |

```bash
curl -X POST -H 'X-Pi-Monitor: 1' -H 'X-Control-Pin: 1234' \
  http://127.0.0.1:8080/api/modules/maps/start
```

`./manage.sh start <module>` and `stop <module>` make the same call. There
is no login: anyone who can open the web app can use the API. Set
`BIND_ADDRESS=127.0.0.1` to keep it on the Pi.
