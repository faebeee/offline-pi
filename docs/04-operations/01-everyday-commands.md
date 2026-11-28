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
4. removes containers of modules no longer in `MODULES` (and the
   containers and images of retired modules),
5. recreates and starts core, which then starts the modules that are
   switched on,
6. waits until the web app answers and prints its address, and, while no
   account exists, the setup code for creating the admin account.

A failed download or build stops at step 2: the running containers keep
their old images. Images of earlier versions are removed at the end, to
free the disk. If one module's container cannot be created, the others still start and the module is
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
| `./manage.sh users` | Lists the accounts and their roles. |
| `./manage.sh users reset-password <name>` | Sets a new password for an account (asked twice, not shown) and logs it out on every device. |
| `./manage.sh users setup-code` | The code for creating the admin account, while none exists. |
| `./manage.sh autostart on\|off\|status` | Whether outpost starts when the Pi boots (on by default). |
| `./manage.sh help` | Prints the usage with every module command. |

Module names are the ones in `MODULES`: `maps`, `knowledge`,
`network`. Files, Board and Supplies are part of core and always on.
Note that the Library module is called `knowledge` here.

`start` and `stop` go through core's API, so the home page shows the same
state and core remembers it at the next boot. They need no login: core
writes a local admin token to `cli.token` in `CORE_DATA_DIR` at every
start, and the script sends it. Core accepts the token only from the Pi
itself (on a Mac, the script runs curl inside the Podman machine for that). If core is not running, they fail with "is core running?"; run
`./start.sh`.

Example output of `status`:

```
MODULE       INSTALLED  STATE
core         yes        Up 2 hours (healthy)
maps         yes        Up 2 hours (healthy)
knowledge    yes        Up 2 hours (healthy)
network      no         -
```

## Accounts

```sh
./manage.sh users                       # list the accounts and their roles
./manage.sh users reset-password admin  # new password for "admin"
```

`reset-password` asks for the new password twice without showing it, and
logs the account out on every device. It is the way back in when the admin
password is forgotten. It needs core to be running and can't be used with
`--yes`. Everything else about accounts happens on the Users screen; see
[Users and login](../03-modules/14-users.md).

## Library commands

These run the `knowledge` tool inside the Library container, so the module
must be running.

| Command | What it does |
|---|---|
| `./manage.sh knowledge list` | Installed books, which are served, what is missing. |
| `./manage.sh knowledge sync` | Downloads missing books of your selection (choose them on the Library screen). |
| `./manage.sh knowledge update` | Downloads newer versions of your books. Old versions are kept but no longer served. |
| `./manage.sh knowledge prune` | Deletes outdated and unselected book files. Shows the list and asks first. |

Maps has no commands of their own; everything happens in the
web app.

## Changing settings

| To change | Do this |
|---|---|
| Modules installed | `./install.sh` |
| A data directory | `./install.sh` (moves the data along) |
| Port, access | `./install.sh --advanced`, or edit `.env` and run `./start.sh` |
| Accounts, passwords, roles | The Users screen in the web app; a forgotten password: `./manage.sh users reset-password <name>` |
| Anything else in `.env` | Edit `.env`, then `./start.sh` |

## See also

- [Updating](02-updating.md)
- [Troubleshooting](05-troubleshooting.md)
- [Settings](../05-reference/01-settings.md)
- [Logs](../03-modules/06-logs.md)
