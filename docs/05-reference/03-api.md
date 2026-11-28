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

Every route needs a login (the session cookie), except the few the login
screen needs: `auth/state`, `auth/setup`, `auth/login`, `auth/logout` and
`system/status`. See [Login and control headers](#login-and-control-headers).

The tables below are an overview. Paths are relative to `/api/`.

## auth

Logging in and out, and the first-run setup. Open without a login, except
`auth/password`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `auth/state` | Whether the first-run setup is due (`setup`), and the logged-in account (`user`, or `null`) |
| `POST` | `auth/setup` | First run only: create the admin account (`{code, username, password}`; `code` is the setup code from `CORE_DATA_DIR/setup.code`, `403` when wrong, counted like a wrong password) and log in. `409` once any account exists |
| `POST` | `auth/login` | Log in (`{username, password}`); sets the session cookie. `401` for a wrong user name or password, `429` after too many |
| `POST` | `auth/logout` | End this session and clear the cookie |
| `POST` | `auth/password` | Change your own password (`{current, password}`); your other sessions end |

## users

The accounts. Admins only (`403` otherwise).

| Method | Path | What it does |
|---|---|---|
| `GET` | `users` | Every account, admins first |
| `POST` | `users` | Add an account (`{username, password, role}`, role `admin` or `user`) |
| `PATCH` | `users/:id` | Change the role and/or set a new password (`{role?, password?}`); a new password logs the account out everywhere |
| `DELETE` | `users/:id` | Delete an account and log it out; not your own, not the last admin |

User names are 1 to 32 letters, digits, dots, dashes or underscores, stored
in lower case. Passwords have at least 8 characters.

## modules

Which modules are installed, switched on and running, and starting or
stopping them.

| Method | Path | What it does |
|---|---|---|
| `GET` | `modules` | Every module with its state, whether start/stop is available, and `adminOnly` for screens only admins see |
| `POST` | `modules/:id/start` | Start a module; the choice survives reboots |
| `POST` | `modules/:id/stop` | Stop a module; it stays off after a reboot |

The `POST` routes need the header `X-Pi-Monitor: 1` and an admin (see
[Login and control headers](#login-and-control-headers)).

## system

Admins only (`403` otherwise), except `system/status` and `system/vitals`.
The same goes for `logs`, `settings`, `diagnostics` and `users`, and for the
Socket.IO namespaces `/system` and `/logs`: every module whose manifest says
`"admin": true`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `system/status` | Cheap liveness check used by core's health check: `503` when sampling stalled. No login needed |
| `GET` | `system/vitals` | What the status strip shows (internet, CPU temperature, voltage, CPU, memory, root disk), for every account; `null` right after start |
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
| `DELETE` | `files/entries?path=` | Delete a file, or a folder with everything in it (admins only) |

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
| `PATCH` | `board/posts/:id` | Change a post or mark it done; changing `pinned` is for admins only |
| `DELETE` | `board/posts/:id` | Delete a post (admins only) |

## supplies

| Method | Path | What it does |
|---|---|---|
| `GET` | `supplies/status` | Counts, warnings and how many days the water lasts |
| `GET` | `supplies/items` | Every item, by category and name |
| `POST` | `supplies/items` | Add an item |
| `PATCH` | `supplies/items/:id` | Change an item |
| `POST` | `supplies/items/:id/adjust` | Add to or take from its quantity |
| `DELETE` | `supplies/items/:id` | Delete an item (admins only) |
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
same DTOs as in the OpenAPI document. A connection needs a login (the
session cookie), like the API.

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

For the login and the roles:

| Status | Meaning |
|---|---|
| `401` | No login: `Log in first.`, or `Create the admin account first.` while no account exists |
| `403` | Logged in, but not an admin: `Only an admin can do this.` |
| `409` | `auth/setup` when an account exists already |
| `429` | `auth/login` after too many wrong passwords: `Too many wrong passwords. Try again in N seconds.` |

## Login and control headers

**Login.** Every `/api/` and `/svc/` request and every Socket.IO connection
needs a session: the cookie `outpost_session` that `auth/login` and
`auth/setup` set (httpOnly, SameSite=Strict, 30 days). Without one, the API
answers `401`, and a page load of a `/svc/` URL redirects to `/`, the login.
Open without a login are `auth/state`, `auth/setup`, `auth/login`,
`auth/logout`, `system/status` (core's health check) and the web app's own
files (`/`, `/assets/`, `/ui/`).

**Control headers.** Starting and stopping modules gives access to the
user's Podman, and some actions delete shared data, so core guards them:

| Guard | Required | Why |
|---|---|---|
| `X-Pi-Monitor: 1` | On every call that changes something (`POST`, `PUT`, `PATCH`, `DELETE`), including `auth/setup`, `auth/login` and `auth/password` | Another web page can't send it with a plain form post (CSRF guard). Missing: `400`. |
| An admin's session | On control actions: module start/stop, blocking, unblocking and forgetting devices and the hotspot switch, deleting shared files, board posts and supplies, pinning posts, and every `users` route | A user's session: `403` `Only an admin can do this.` |

From the Pi, log in with a cookie jar and send the cookie along:

```bash
curl -c jar -H 'X-Pi-Monitor: 1' -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"..."}' http://127.0.0.1:8080/api/auth/login
curl -b jar -X POST -H 'X-Pi-Monitor: 1' \
  http://127.0.0.1:8080/api/modules/maps/start
```

**Scripts.** `./manage.sh` needs no login: core writes a random local admin
token to `CORE_DATA_DIR/cli.token` (readable by the owner only) at every
start, and the scripts send it as `Authorization: Bearer <token>`. Core
accepts it only on a connection from the machine itself (`127.0.0.1`,
`::1`); from the network it counts as no login.
`./manage.sh start <module>` and `stop <module>` make the call above that
way.
