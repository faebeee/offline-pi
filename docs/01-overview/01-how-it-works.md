# How it works

outpost is one Podman Compose project named `outpost`. It has one set
of scripts, one settings file (`.env`) and one port. Inside, it is a small
group of containers.

## Core and modules

**Core** (container `outpost-core`) is the part that always runs. It is
the only thing the network can reach, and the only thing your browser talks
to. On `PORT` (8080 by default) it serves:

| Path | What it is |
|---|---|
| `/` | The web app: every screen of every module. |
| `/api/<domain>/` | The API. Swagger UI at `/api/docs`. |
| `/socket.io` | Live updates (dashboard readings, messages, download progress). |
| `/svc/<module>/` | A passthrough to a module's raw files: map tiles, fonts, Kiwix articles. |

Core also shows the System and Logs screens itself, and it starts and stops
the other modules.

**Modules** (Maps, Library, Mesh) are one container each, named
`outpost-<name>`. They have no user interface of their own: just an API,
their data and background jobs. Each listens only on `127.0.0.1` (the Pi
itself) on an internal port, so nobody on the network can reach a module
directly. Core forwards to them.

| Module | Container | Internal port |
|---|---|---|
| Maps | `outpost-maps` | `8081` |
| Library | `outpost-knowledge` | `8082` |
| Mesh | `outpost-mesh` | `8084` |

## One port, one origin

Because everything goes through core, you only ever open one address,
`http://<pi>:8080`. There are no other ports to remember or open in a
firewall, and links between screens never point at another port.

All containers use the host's network directly (`network_mode: host`). That
avoids a known problem with rootless Podman networking getting stuck after
the Wi-Fi reconnects.

## Installed, switched on, running

A module goes through three states:

1. **Installed**: it is listed in `MODULES` in `.env`. `install.sh` writes
   that list when you pick modules. Only installed modules are built and get
   a container. To add or remove one, re-run `./install.sh`.
2. **Switched on**: you choose on the home page (or with
   `./manage.sh start|stop <module>`) which installed modules should run.
   Core remembers the modules you switched **off** in
   `CORE_DATA_DIR/modules.json`.
3. **Running**: the container is up.

Some modules also need settings before they can start. Mesh, for example,
needs `MESH_CONNECTION`. Until `install.sh` has set it, the home page shows
the module as "Not configured" and core does not start it.

### Restarts and reboots

- Core has the restart policy `always`. After a reboot, the user service
  `podman-restart.service` brings it back. `install.sh` enables that service
  and "lingering" for your user, so this works without anybody logging in.
- When core starts, it brings every installed module to the state you
  chose: it starts the ones switched on (a module after the ones it needs) and stops the
  ones switched off.
- Modules have the restart policy `on-failure`. Podman restarts a module
  that crashed, but not one you stopped. A module you switched off stays off
  after a reboot until you switch it on again.

Core starts and stops modules through your user's Podman API socket
(`podman.socket`), which `install.sh` enables.

## Data directories

Every module keeps what it stores in a directory on the Pi, set in `.env`
as a `*_DIR` variable. By default they are folders under `data/` in the
project folder. Directories that can grow large (maps, books) can live on
an SSD instead. See [Storage and SSD](../02-installation/02-storage.md).

The containers themselves hold no data. You can rebuild or recreate them at
any time (`./start.sh` does that on every run) without losing anything.

## The web app

There is one web app for everything. Every screen has the same frame: a
header, the module navigation and a status strip at the bottom. If a module
is not installed, not configured or not running, its screen says so and,
where possible, offers a START button.

There is no login. Anyone who can open the web app can use it. To limit
that:

- Set `CONTROL_PIN` to require a PIN before modules are started or stopped.
- Set `MESH_SEND_PIN` to require a PIN before messages are sent.
- Set `BIND_ADDRESS=127.0.0.1` to allow only the Pi itself.

## Nothing loaded from the internet at runtime

The web app, its fonts and icons, the map styles, fonts and sprites are all
served by the Pi. No page loads anything from a CDN or another website. That
is what makes the screens work with the network unplugged. The internet is
only used when you install or update outpost and when you download map
regions or books.

## See also

- [Hardware](02-hardware.md)
- [Install](../02-installation/01-install.md)
- [Architecture](../06-development/01-architecture.md)
- [Paths and ports](../05-reference/02-paths-and-ports.md)
