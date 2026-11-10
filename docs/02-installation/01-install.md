# Install

## Requirements

- A Raspberry Pi (or another Linux machine) with internet access during the
  installation. See [Hardware](../01-overview/02-hardware.md).
- `git`, to clone the project and later to update it.
- Podman and a compose backend (`podman compose` or `podman-compose`). If
  they are missing, `install.sh` offers to install them with `apt` or
  `dnf`.
- For Mesh: a Meshtastic node, plugged in by USB with a data cable (or
  reachable on the network).
- Optional: an SSD for maps and books.

Run everything as your normal user, not as root. outpost uses rootless
Podman; `install.sh` asks for `sudo` only when it needs it (installing
packages, adding your user to a group, enabling lingering).

## Clone and run the installer

```sh
git clone https://github.com/faebeee/offline-pi.git
cd outpost
./install.sh
```

## The five steps

`install.sh` walks through five steps with arrow-key menus.

1. **System check.** Checks Podman and the compose backend and offers to
   install what is missing. Creates `.env` from `.env.example` on the first
   run. Adopts an old per-app installation if it finds one (see below).
   Detects the Pi's firmware device (for voltage readings), Podman's storage
   and its API socket, and enables `podman.socket` (core needs it to start
   and stop modules).
2. **Web app.** The port (default `8080`), who can open it (every device on
   the network, or only this machine) and an optional PIN for starting and
   stopping modules. Asked on the first run; later it shows the current
   values and asks only if you want to change them. See
   [Network and hotspot](03-network-and-hotspot.md).
3. **Modules.** A checkbox list of the modules to install: Maps, Mesh map,
   Mesh, Library. The current choice is the default. Core (home, System,
   Logs) is always installed.
4. **Storage and settings.** Where each module keeps its data, one question
   per directory, plus module specifics. For Mesh: how the node is connected
   (USB or network), an optional send PIN, and which USB device is the node.
   See [Storage and SSD](02-storage.md).
5. **Build and start.** Shows a summary (web app address, modules, data
   directories) and asks before building. Then it builds every image, runs
   one-off setup (Maps downloads its fonts, sprites and region catalog),
   enables `podman-restart.service` and lingering so outpost comes back
   after a reboot, and finally runs `./start.sh`.

If you answer "no" at the summary, your answers are saved in `.env` and
nothing is built. Run `./install.sh` again when you are ready.

## Options

| Option | Effect |
|---|---|
| `--yes` | Asks nothing: keeps the current answers (the defaults on a first run). |
| `--plain` | Line-by-line prompts instead of menus. Used automatically without a terminal. |
| `--verbose` | Shows the build output instead of a progress line. |
| `--help` | Prints the usage. |

## install.log

The full output of every step (builds, downloads) goes to `install.log` in
the project folder. The file is overwritten on each run. When a step fails,
the installer shows the last lines and the path of the log. A failed build
starts nothing: fix the error and re-run `./install.sh`.

## First start

At the end, `start.sh` creates the containers, starts core and waits until
the web app answers. It prints the addresses:

```
✔ outpost is up and running!
  Local:   http://localhost:8080
  LAN:     http://192.168.1.20:8080
```

Open the LAN address in a browser on any device on the same network:
`http://<pi>:8080`, where `<pi>` is the Pi's IP address or host name.

The home page lists every installed module. Next steps:

- **Maps**: download a region. See [Maps](../03-modules/02-maps.md).
- **Library**: choose books. See [Library](../03-modules/03-library.md).
- **Mesh**: check that the radio is connected. See
  [Mesh](../03-modules/04-mesh.md).

## Re-running install.sh

`install.sh` is safe to run again at any time. Use it to:

- add or remove modules (step 3),
- move data to another disk: every data directory is asked again, with the
  current location as the default, and existing data is moved if you change
  it,
- pick another Meshtastic device, or configure Mesh after plugging in the
  node,
- change port, access or control PIN (step 2).

Settings that `install.sh` does not ask about can be edited in `.env`
directly; run `./start.sh` afterwards. See
[Settings](../05-reference/01-settings.md).

## Upgrading from the per-app layout

Older versions of outpost had one stack per app under `apps/<name>/`, each
with its own `.env`. After `git pull`, run `./install.sh` once. For every
`apps/<name>/.env` it finds, it:

1. copies the settings into the new `.env`, including the data locations,
   so nothing has to be downloaded again,
2. marks the module as installed,
3. removes the old containers and images,
4. renames the old file to `apps/<name>/.env.migrated`.

The data stays where it is. The storage questions in step 4 default to the
old locations and offer to move the data out of `apps/`.

## See also

- [Storage and SSD](02-storage.md)
- [Everyday commands](../04-operations/01-everyday-commands.md)
- [Troubleshooting](../04-operations/05-troubleshooting.md)
