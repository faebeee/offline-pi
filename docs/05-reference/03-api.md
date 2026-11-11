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

## mesh

| Method | Path | What it does |
|---|---|---|
| `GET` | `mesh/status` | Radio state, own node, channels and the send settings |
| `GET` | `mesh/conversations` | Conversations with traffic, newest first |
| `GET` | `mesh/messages?conv=&before=&limit=` | Messages of one conversation, newest last; page back with `before` (a message id) |
| `GET` | `mesh/nodes` | Every node the radio has heard of |
| `POST` | `mesh/messages` | Send a text to a channel or a node; `401` wrong PIN, `429` rate limit, `503` radio down |

Sending needs the header `X-Send-PIN` when `MESH_SEND_PIN` is set.

## library

| Method | Path | What it does |
|---|---|---|
| `GET` | `library/books` | Every installed book, by title |
| `GET` | `library/catalog` | The books on offer, which are selected and which are installed |
| `PUT` | `library/selection` | Replace the selection: unselected books are deleted, new ones download in the background |
| `GET` | `library/sync` | Whether selected books are being downloaded, and how far |
| `POST` | `library/sync` | Download missing selected books now (or newer versions); runs in the background |
| `GET` | `library/search?q=&bookId=&lang=&start=&pageLength=` | Full-text search in one book (`bookId`) or every book of one language (`lang`) |

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

## Live updates

Socket.IO on `/socket.io`, one namespace per domain. The payloads are the
same DTOs as in the OpenAPI document.

| Namespace | Core sends | The browser sends |
|---|---|---|
| `/system` | `init` on connect (history, the last 15 minutes, the latest snapshot), then `snapshot` per sample | |
| `/maps` | `job` on every change of a watched job, until it is done, failed or cancelled | `watchJob` / `unwatchJob` with a job id |
| `/mesh` | `link` (core's connection to the mesh container), `status`, `message` (new or changed), `node`, `nodes` | |
| `/logs` | `entries` (new lines of a followed source, in batches), `followError` (the stream failed or ended) | `follow` / `unfollow` with a source (`core` or a module id) |

The mesh nodes layer of Maps has no namespace of its own; it uses `/mesh`.

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

Starting and stopping modules gives access to the user's Podman, so core
guards it:

| Header | Required | Why |
|---|---|---|
| `X-Pi-Monitor: 1` | Always, on `POST /api/modules/:id/:action` | Another web page can't send it with a plain form post (CSRF guard). Missing: `400`. |
| `X-Control-Pin` | When `CONTROL_PIN` is set | Wrong or missing: `403`. |

```bash
curl -X POST -H 'X-Pi-Monitor: 1' -H 'X-Control-Pin: 1234' \
  http://127.0.0.1:8080/api/modules/maps/start
```

`./manage.sh start <module>` and `stop <module>` make the same call. There
is no login: anyone who can open the web app can use the API. Set
`BIND_ADDRESS=127.0.0.1` to keep it on the Pi.
