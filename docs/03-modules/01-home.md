# Home

Home is the first screen you see at `http://<pi>:8080`. It shows what is
installed, what is running, and lets you start and stop modules. Open it
any time with Home in the module nav.

## Hero

The top of the screen shows the state of the whole Pi in one line:

- `OUTPOST ONLINE`: the app reaches core. Below it you see how many
  optional modules are running, for example `3 OF 4 MODULES RUNNING · NO INTERNET NEEDED`.
- `CONNECTING`: the app is still reaching core.
- `SIGNAL LOST`: core does not answer. The status strip shows
  `CORE · OFFLINE`. Check that the Pi is on and that you are on its network,
  then see [Troubleshooting](../04-operations/05-troubleshooting.md).

## Module tiles

Below the hero is one tile per installed module. Tap a tile to open the
module. Each tile shows the module's icon, a state badge, its name and one
line about what it does. A tile of a module that is not running is greyed
out. System, Logs and Info are part of core: they are always on and always
show `RUNNING`.

## Badge states

The same badges appear on the tiles and in the switch list.

| Badge | Colour | Meaning | What to do |
|---|---|---|---|
| `RUNNING` | Green | The module runs. The line under it says `On`, or `On (switched off)` if it runs although its switch is off | Nothing |
| `STARTING` | Amber, striped | Core is starting it, or its health check has not passed yet | Wait a few seconds |
| `STOPPING` | Amber, striped | Core is stopping it | Wait |
| `OFF` | Grey | Switched off on purpose | Switch it on if you need it |
| `STOPPED` | Red | Switched on, but not running. The line shows the error, or `Switched on but not running` | Check [Logs](07-logs.md), then switch it off and on again |
| `UNHEALTHY` | Red | Running, but its health check fails | Check [Logs](07-logs.md) |
| `NO CONTAINER` | Red | Installed, but its container is missing | Run `./start.sh` on the Pi |
| `NOT CONFIGURED` | Amber | A required setting is missing (Mesh needs its radio connection) | Run `./install.sh` on the Pi |
| `NOT INSTALLED` | Grey | Not chosen during installation | Run `./install.sh` on the Pi and select it |

## Modules on this Pi

The card at the bottom lists every optional module (Maps, Mesh map, Mesh,
Library) with its badge, a short status line and an on/off switch. The card
head shows how many installed modules are running, for example
`2 OF 3 RUNNING`.

- Turn a switch on to start the module, off to stop it. The badge changes
  to `STARTING` or `STOPPING` while core works.
- A switch is disabled when the module is not installed, not configured,
  busy, or when core cannot control containers. The line under the name
  says why.
- If starting or stopping fails, a red banner `Could not start <module>`
  or `Could not stop <module>` shows the error.
- Mesh map needs Mesh to show nodes. Switching Mesh map on does not
  switch Mesh on; do that too. When the Pi boots, core starts Mesh before
  Mesh map.

You can do the same from a terminal on the Pi with
`./manage.sh start <module>` and `./manage.sh stop <module>`. See
[Everyday commands](../04-operations/01-everyday-commands.md).

### What survives a reboot

Your choice is stored on the Pi, not in the browser. A module you switched
off stays off after a restart of the Pi or of outpost, until you switch
it on again. Every module that is switched on is started again
automatically when core starts.

Stopping a module never deletes its data. Maps regions, library books and
mesh messages stay on disk.

### Adding or removing modules

The switches only start and stop modules that are installed. To add or
remove a module, run `./install.sh` on the Pi again and change your choice.
See [Install](../02-installation/01-install.md).

## The control PIN

By default anyone who can open the app can start and stop modules. To
prevent that, set `CONTROL_PIN` in `.env` (see
[Settings](../05-reference/01-settings.md)) and restart with `./start.sh`.

With a PIN set, the browser asks `Control PIN` the first time you start or
stop a module in a tab. The PIN is kept for that browser tab only. If it is
wrong, you are asked again. Cancel the prompt to leave the module as it is.
The same PIN is asked for the START and STOP buttons on the module gate and
on the [System](06-system.md) screen.
