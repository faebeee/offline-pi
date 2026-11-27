# Install

## Requirements

- A Raspberry Pi (64-bit Raspberry Pi OS) or another Linux machine, with
  internet access during the installation. See
  [Hardware](../01-overview/02-hardware.md).
- For Mesh: a Meshtastic node, plugged in by USB with a data cable (or
  reachable on the network).
- Optional: an SSD for maps, books and shared files.

Everything else (git, Podman, a compose backend) the installer offers to
install for you.

Run everything as your normal user, not as root. outpost uses rootless
Podman and asks for `sudo` only when it needs it (installing packages,
enabling lingering).

## One command

```sh
curl -fsSL https://raw.githubusercontent.com/faebeee/offline-pi/main/get.sh | bash
```

This installs git if it is missing, downloads outpost to `~/outpost` and
starts the installer there. To put it somewhere else, set `OUTPOST_HOME`:

```sh
curl -fsSL https://raw.githubusercontent.com/faebeee/offline-pi/main/get.sh | OUTPOST_HOME=/opt/outpost bash
```

If you prefer to do it by hand:

```sh
git clone https://github.com/faebeee/offline-pi.git ~/outpost
cd ~/outpost
./install.sh
```

## What the installer asks

On a first install there are only a few questions:

1. **Which modules?** A checkbox list: Maps, Mesh, Library, Network.
   Files, Board and Supplies are always included, like System, Logs, Info,
   Settings and Diagnostics.
2. **Where should outpost keep its data?** One folder for everything,
   `~/outpost/data` by default. Maps and books can take hundreds of GB: if
   you have an SSD, answer with a folder on it, for example
   `/mnt/ssd/outpost`. See [Storage and SSD](02-storage.md).
3. **Module questions**, only for the modules that need them: for Mesh,
   how the node is connected (USB or network) and which USB device it is;
   for Network, whether to install its small host helper.

Everything else uses defaults: port `8080`, every device on the network
may open outpost, and no control PIN. `./install.sh --advanced` asks for
those too (see [Options](#options)).

## What it does

The installer runs four steps and shows each with a progress line:

1. **System check.** Offers to install Podman and the compose backend if
   they are missing, creates `.env`, and detects the Pi's firmware device
   (for voltage readings) and Podman's API socket.
2. **Modules.** Your choice from above.
3. **Data and settings.** The data folder and the module questions.
4. **Download and start.** Downloads the ready-made container images for
   this version (a few minutes), runs one-off setup (Maps fetches its
   fonts and sprites), makes outpost **start by itself when the Pi boots**,
   and starts it.

The images are built for 64-bit Raspberry Pis and PCs (arm64 and amd64)
and published for every version. If there are none for your version (for
example on a fork, or with local changes), the installer builds them on
the Pi instead. That takes 10 to 30 minutes the first time.

## Options

| Option | Effect |
|---|---|
| `--advanced` | Also asks for the port, who may open outpost (every device, or only this machine), the control PIN, the Mesh send PIN and a separate folder for each kind of data. Shows a summary and asks before installing. |
| `--yes` | Asks nothing: keeps the current answers (the defaults on a first run). |
| `--build` | Builds the images on this machine instead of downloading them. |
| `--no-cache` | Builds them from scratch (implies `--build`). |
| `--plain` | Line-by-line prompts instead of menus. Used automatically without a terminal. |
| `--verbose` | Shows the download and build output instead of a progress line. |
| `--help` | Prints the usage. |

With the one-line install, pass options after `bash -s --`:

```sh
curl -fsSL https://raw.githubusercontent.com/faebeee/offline-pi/main/get.sh | bash -s -- --advanced
```

## install.log

The full output of every step (downloads, builds) goes to `install.log` in
the project folder. The file is overwritten on each run. When a step fails,
the installer shows the last lines and the path of the log. A failed
download or build starts nothing: fix the error and re-run `./install.sh`.

## First start

At the end, the installer starts outpost and waits until the web app
answers. It prints the addresses:

```
✔ outpost is up and running!
  Local:   http://localhost:8080
  LAN:     http://192.168.1.20:8080
```

Open the LAN address in a browser on any device on the same network:
`http://<pi>:8080`, where `<pi>` is the Pi's IP address or host name.

From now on outpost starts by itself whenever the Pi boots, and stops
cleanly when it shuts down. `./manage.sh autostart off` turns that off.

The home page lists every installed module. Next steps:

- **Maps**: download a region. See [Maps](../03-modules/02-maps.md).
- **Library**: choose books, start with the emergency set. See
  [Library](../03-modules/03-library.md).
- **Mesh**: check that the radio is connected. See
  [Mesh](../03-modules/04-mesh.md).

## Re-running install.sh

`install.sh` is safe to run again at any time, also through the one-line
command. Use it to:

- add or remove modules,
- move the data to another disk: answer the data question with the new
  folder and the existing data is moved there,
- pick another Meshtastic device, or configure Mesh after plugging in the
  node,
- change the port, access or control PIN (`./install.sh --advanced`).

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

The data stays where it is; data folders set by hand are left where they
are (`./install.sh --advanced` moves them one by one).

## See also

- [Storage and SSD](02-storage.md)
- [Everyday commands](../04-operations/01-everyday-commands.md)
- [Troubleshooting](../04-operations/05-troubleshooting.md)
