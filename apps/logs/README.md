# Logs: log lines of core and every module

The Logs module (`/logs`, number 06) shows what outpost writes to its logs,
for debugging, without SSH or `./manage.sh logs`. It has **no container of
its own**: like System it is served by core (`"service": "core"` in
`module.json`, always on). Its domain lives in
`apps/core/src/domains/logs/`, its screen in `apps/web/src/features/logs/`.

## What it shows

- **Sources**: core, plus every installed module (`MODULES`), each with an
  LED for its container state. `?source=<module id>` links to one.
- **Lines**: the last 200 to 5000 lines, then new lines live as they are
  written. Every line has its time (UTC), level and context, if it has one.
- **Filters**: level (all, info and up, warnings and up, errors only) and
  free text over message and context. The status strip shows the number of
  lines, errors and warnings loaded.
- **Pause / Resume** stops and restarts the live lines. **Download** saves
  the lines shown (after filters) as a `.log` file.

## Where the lines come from

| Source | How |
|---|---|
| core | **NestJS logging**: core's app logger is `CoreLogger` (`apps/core/src/platform/logging/`), a `ConsoleLogger` that prints as before and also keeps the last 2000 lines in memory (`LogBuffer`), with level, context and the stack of errors. Every `new Logger(Context)` in core goes through it. The buffer starts empty at every core start; older lines are in `./manage.sh logs core`. |
| modules | **Podman**: `GET /libpod/containers/<name>/logs` on the user's `podman.socket` (the same socket core uses for start/stop), with timestamps. Followed sources keep one stream open per source, shared by every browser, closed when nobody follows it any more. Lines reach the browser in batches every 250 ms. |

Container lines are parsed into levels: Nest's console and JSON output
(maps backend), Python logging (mesh), `LEVEL:` prefixes (uvicorn). Other
lines (kiwix) are level `log`. Stack traces and indented lines
take the level of the line before them, so an error keeps its stack when
filtering.

## Settings

| Variable | Default | Description |
|---|---|---|
| `CORE_LOG_LEVEL` | `log` | Least severe level core logs: `verbose`, `debug`, `log`, `warn`, `error`, `fatal`. `debug` adds e.g. socket connects. |
| `PODMAN_SOCKET` | from `install.sh` | Needed for module logs; without it only core's lines are shown. |

## API

- `GET /api/logs/sources`: core and the installed modules, with state.
- `GET /api/logs/:source?tail=500`: the last lines (`tail` 1 to 5000),
  oldest first. A module whose logs can't be read answers
  `available: false` with the reason.
- Socket.IO `/logs`: send `follow` / `unfollow` with a source id, get
  `entries` (`{ source, entries }`) and `followError` when a stream fails or
  ends (container stopped; the screen offers RESUME).

Like the rest of core there is no login: anyone who can open outpost can
read its logs. Set `BIND_ADDRESS=127.0.0.1` to keep it to the Pi.
