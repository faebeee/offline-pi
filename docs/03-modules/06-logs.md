# Logs

Logs shows the log lines that core and every module write, live, in the
browser. Use it to find out why something does not work, without a
terminal on the Pi. It is part of core, so it is always on. Open it with
Logs in the module nav (`/logs`).

## Sources

The chips at the top choose whose lines you see: core, and every installed
module (Maps, Library, Mesh). Each chip has an LED for the state
of that module's container. The header title is the chosen source.

- **core** shows the lines of the app itself (module start and stop, API
  errors, System readings). Core keeps its last 2000 lines in memory, so
  the list starts empty after core restarts. Older lines are in
  `./manage.sh logs` on the Pi.
- **A module** shows the lines of its container, for example download
  progress in Library or radio messages in Mesh.

You can link to one source directly: `/logs?source=mesh`.

## Lines

Each line shows the time in UTC (`14:32:05.123`), the level, the context in
brackets (where the line came from) and the message. Warnings have an amber
edge and icon, errors a red edge, icon and background. The level is always
written out, so you do not have to rely on colour.

When you open a source, the screen loads its last lines, then adds new
lines live as they are written. The view stays at the newest line unless
you scroll up to read older ones. The card head shows the state and how
many lines are shown, for example `LIVE · 120 / 500`. At most the newest
2000 lines are drawn; filters still search all loaded lines.

## Levels

From most to least severe: `FATAL`, `ERROR`, `WARN`, `LOG` (normal
information), `DEBUG` and `VERBOSE`. Lines from modules that do not write a
level (Library) count as `LOG`. Lines of a stack trace keep the
level of the error above them.

## Filters

- **Level**: ALL, INFO+ (information and worse), WARN+ (warnings and
  errors) or ERRORS (errors only).
- **Text**: type in FILTER LINES to show only lines whose message or
  context contains the text, for example `timeout`.
- **Lines to load**: LAST 200, 500, 1000, 2000 or 5000.

The context line counts the errors (`ERR`) and warnings (`WARN`) among the
loaded lines; the LINES card shows the state (`LIVE`, `PAUSED`, ...) and
how many lines are loaded.

## Pause and resume

PAUSE stops new lines from arriving, so the list stops moving while you
read. RESUME starts them again.

When a container stops, its live lines stop too. A `Live lines stopped`
banner appears with a RESUME button. Press it once the module runs again.

## Download

The download button saves the lines you see (after filters) as a `.log`
file named after the source and the time, for example
`outpost-mesh-2026-11-10T14-32-05-123Z.log`. Attach it when you ask
someone for help.

## When lines are missing

- `Container logs unavailable`: core cannot reach the Podman socket, so
  only core's own lines are shown. Re-run `./install.sh` (it detects the
  socket).
- `No logs from <module>`: the container's logs cannot be read, with the
  reason.

Anyone who can open outpost can read its logs. To keep them to the Pi,
see `BIND_ADDRESS` in [Settings](../05-reference/01-settings.md). For logs
in a terminal, see [Everyday commands](../04-operations/01-everyday-commands.md)
and [Troubleshooting](../04-operations/05-troubleshooting.md).
