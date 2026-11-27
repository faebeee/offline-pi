# Everyday commands

Three scripts cover daily operation: `start.sh` (re)starts outpost,
`stop.sh` stops it, and `manage.sh` shows the state, starts and stops
modules, follows logs and runs module commands. `start.sh` and `manage.sh`
need an existing installation (`.env`); without
one they tell you to run `./install.sh` first.

## start.sh

```sh
./start.sh              # get the images of this version, recreate every container
./start.sh --build      # build the images on this machine instead of downloading
./start.sh --no-cache   # build every image from scratch
```

Run it after you edit `.env`, after a failed start, or whenever something
seems stuck. It:

1. checks that every data directory exists (see
   [Storage and SSD](../02-installation/02-storage.md#when-the-drive-is-not-there)),
2. gets the images of this version: those already here are used, the
   others downloaded; only what can't be downloaded is built,
3. recreates the container of every installed module without starting it,
4. removes containers of modules no longer in `MODULES` (and the old
   Mesh map container and image, now part of Maps),
5. recreates and starts core, which then starts the modules that are
   switched on,
6. waits until the web app answers and prints its address.

A failed download or build stops at step 2: the running containers keep
their old images. Images of earlier versions are removed at the end, to
free the disk. If one module's container cannot be created (for example the
Meshtastic node is unplugged), the others still start and the module is
listed as "Not available" at the end. The full output goes to `start.log`.

## Start at boot

outpost starts by itself when the Pi boots and stops cleanly when it shuts
down (a systemd user unit, `outpost.service`, set up by `install.sh`). At
boot it only starts the existing containers, so it is quick, and it waits
up to two minutes for a USB drive to mount.

```sh
./manage.sh autostart status   # does it start at boot?
./manage.sh autostart off      # no: start it with ./start.sh yourself
./manage.sh autostart on       # yes again
```

On a Mac there is no start at boot: run `./start.sh` after a restart.

## stop.sh

```sh
./stop.sh
```

Stops core, then every module. Nothing is removed: containers, images and
data stay, and so do the switches on the home page, so the next
`./start.sh` brings back the same modules. On a Mac it leaves the Podman
machine running (`podman machine stop` stops it too).

## manage.sh

| Command | What it does |
|---|---|
| `./manage.sh status` | Every module: installed or not, and the container's state. |
| `./manage.sh start <module>` | Switches a module on, like the switch on the home page. |
| `./manage.sh stop <module>` | Switches a module off. It stays off after a reboot. |
| `./manage.sh logs` | Follows core's log (Ctrl+C to quit). |
| `./manage.sh logs <module>` | Follows a module's log. |
| `./manage.sh autostart on\|off\|status` | Whether outpost starts when the Pi boots (on by default). |
| `./manage.sh help` | Prints the usage with every module command. |

Module names are the ones in `MODULES`: `maps`, `knowledge`, `mesh`,
`network`. Files, Board and Supplies are part of core and always on.
Note that the Library module is called `knowledge` here.

`start` and `stop` go through core's API, so the home page shows the same
state and core remembers it at the next boot. They send `CONTROL_PIN` for
you. If core is not running, they fail with "is core running?"; run
`./start.sh`.

Example output of `status`:

```
MODULE       INSTALLED  STATE
core         yes        Up 2 hours (healthy)
maps         yes        Up 2 hours (healthy)
mesh         no         -
knowledge    yes        Up 2 hours (healthy)
```

## Library commands

These run the `knowledge` tool inside the Library container, so the module
must be running.

| Command | What it does |
|---|---|
| `./manage.sh knowledge list` | Installed books, which are served, what is missing. |
| `./manage.sh knowledge sync` | Downloads missing books of your selection (choose them on the Library screen). |
| `./manage.sh knowledge update` | Downloads newer versions of your books. Old versions are kept but no longer served. |
| `./manage.sh knowledge prune` | Deletes outdated and unselected book files. Shows the list and asks first. |

## Mesh commands

| Command | What it does |
|---|---|
| `./manage.sh mesh status` | Radio state, connection, node, firmware, LoRa region and channels. |
| `./manage.sh mesh export [FILE]` | All messages as CSV, to `FILE` or to the terminal. |
| `./manage.sh mesh info` | Everything the node reports: configuration, channels, node list. |
| `./manage.sh mesh set-name LONG [SHORT]` | The owner name others see. `SHORT` has up to 4 characters. |
| `./manage.sh mesh set-region CODE` | The LoRa region, for example `EU_868` (Switzerland and the EU). |
| `./manage.sh mesh fixed-position LAT LON` | A fixed position for the node, with GPS off (the Pi does not move). |
| `./manage.sh mesh add-channel NAME` | Adds a private channel with a random key. |
| `./manage.sh mesh share` | Channel URL and QR code, to set up the other nodes. |
| `./manage.sh mesh cli ARGS...` | Any other `meshtastic` CLI command, for example `cli --get lora`. |

`status` and `export` need the Mesh module running. The others (`info`,
`set-name`, `set-region`, `fixed-position`, `add-channel`, `share`, `cli`)
talk to the node with the official `meshtastic` CLI. Only one program can
hold the radio's connection, so they stop Mesh for a few seconds and start
it again afterwards, also when the command fails or you press Ctrl+C. They
need Mesh to be configured, and for a USB node the node must be plugged in.

```sh
./manage.sh mesh set-name "Pi Base" PI
./manage.sh mesh set-region EU_868
./manage.sh mesh fixed-position 47.37 8.54
./manage.sh mesh add-channel Family
./manage.sh mesh share
```

Maps has no commands of their own; everything happens in the
web app.

## Changing settings

| To change | Do this |
|---|---|
| Modules installed | `./install.sh` |
| A data directory | `./install.sh` (moves the data along) |
| Meshtastic device or connection | `./install.sh` |
| Port, access, control PIN | `./install.sh`, or edit `.env` and run `./start.sh` |
| Anything else in `.env` | Edit `.env`, then `./start.sh` |

## See also

- [Updating](02-updating.md)
- [Troubleshooting](05-troubleshooting.md)
- [Settings](../05-reference/01-settings.md)
- [Logs](../03-modules/06-logs.md)
