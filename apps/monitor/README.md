# pi-monitor

A realtime system dashboard for the Raspberry Pi, built with NestJS and
WebSockets (Socket.IO). Open it in a browser on the LAN and every reading
updates live, every 2 seconds by default. Fully offline: no CDN, no external
fonts or chart libraries.

What it shows:

| Card | Readings |
|---|---|
| **Health banner** | One summary line: under-voltage or throttling now or since boot, high temperature, nearly full disks, low input voltage |
| **Temperature** | CPU temperature (with severity), RP1 I/O chip and other hwmon sensors, fan RPM/PWM if a fan is fitted, soft temperature limit |
| **Power** | 5 V input voltage (Pi 5 PMIC `EXT5V`), core voltage, board power in W, PSU max current negotiated via USB-PD, USB current limit (600 mA / 1.6 A), USB over-current, raw `get_throttled` flags, every PMIC rail |
| **CPU** | Total and per-core usage, per-core frequency, load average, frequency capping/throttling |
| **Memory** | RAM used/available, swap |
| **Storage** | Every mounted block device (SD card, SSD, boot partition) with free space, disk read/write throughput |
| **Network** | Per-interface throughput, Wi-Fi signal, IP addresses |
| **Apps & containers** | Every Podman container (running and stopped) with its offline-pi app (compose project), state, health check result, ports (linked), uptime, CPU and memory; optional START/STOP buttons per app (`CONTAINER_CONTROL=true`) |
| **Connections** | Ports open on the Pi and who listens on them, active TCP connections (direction, remote address, local port, app/process), counts per state; loopback hidden by default |
| **System** | Hostname, model, OS, kernel, uptime, process count |
| **Power events** | Log of when under-voltage/throttling started and ended |

Temperature, input voltage, CPU, memory and network have charts for the
last 15 minutes or the last 24 hours (one point per minute; the voltage chart
keeps each minute's *lowest* value so short dips stay visible). The 24 h
history and the event log survive restarts (`$DATA_DIR/history.json`).

## Requirements

- Raspberry Pi OS / Debian (works on other Linux hosts too, minus the
  firmware voltage/throttle readings)
- Podman and `podman compose` (or `podman-compose`); `install.sh` offers to
  install them via apt
- The user running it in the `video` group for `/dev/vcio_gencmd`
  (default for the Pi OS user)

## Quick start

```sh
git clone <this repo> offline-pi
cd offline-pi/apps/monitor
./install.sh
```

Then open `http://<pi-ip>:8080`.

## What `install.sh` does

1. Checks for Podman and a compose backend, offering to install them via apt.
2. On first run copies `.env.example` to `.env` and asks for the port and
   bind address.
3. Asks where to keep the history (`DATA_DIR`) on every run; if you choose a
   new location, it offers to move the existing data there.
4. Detects the firmware device (`/dev/vcio_gencmd`, or `/dev/vcio` on older
   kernels, `/dev/null` if not a Pi) and warns if your user can't access it.
5. Builds the image (compiles `vcgencmd` from
   [raspberrypi/utils](https://github.com/raspberrypi/utils), since it is not
   packaged in Debian).
6. Asks once whether the dashboard may start and stop the other apps
   (`CONTAINER_CONTROL`); if yes, enables your `podman.socket` and records its
   path (`PODMAN_SOCKET`) on every run.
7. Enables `podman-restart.service` and lingering so the dashboard comes back
   after a reboot, then runs `start.sh`.

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `DATA_DIR` | `./data` | Where `history.json` (24 h history + power events, < 1 MB) lives. Can point at an SSD mount, e.g. `/mnt/ssd/monitor/data`. |
| `PORT` | `8080` | Dashboard port on the Pi (host networking, no port mapping). Other apps: `8081` maps, `8082` knowledge. |
| `BIND_ADDRESS` | `0.0.0.0` | `0.0.0.0` for LAN access, `127.0.0.1` for this Pi only. |
| `SAMPLE_INTERVAL_MS` | `2000` | How often the Pi is sampled and pushed to dashboards (min 500). Containers and connections refresh every 5 s. |
| `PODMAN_GRAPH_ROOT` | from `podman info` | Host path of Podman's storage, whose `db.sql` lists the containers; set by `install.sh` on every run. Empty = search the default locations. |
| `CONTAINER_CONTROL` | `false` | `true` shows START/STOP buttons in the apps card (see below). Asked once by `install.sh`; change it in `.env` and re-run `./install.sh`. |
| `PODMAN_SOCKET` | from `podman info` | Host path of your Podman API socket, used when `CONTAINER_CONTROL=true`; set by `install.sh` on every run. |
| `VCIO_DEVICE` | `/dev/vcio_gencmd` | Firmware mailbox for `vcgencmd`; set by `install.sh` on every run. |

## Podman usage

```sh
./start.sh                 # start / restart (rebuilds if the source changed)
podman compose logs -f     # follow logs (warns when under-voltage is detected)
podman compose down        # stop
```

Re-running `./install.sh` with a new `DATA_DIR` is the supported way to move
the history (e.g. to a newly mounted SSD) without losing it.

### How the container sees the host

The metrics have to describe the Pi, not the container, so the service runs
with:

- `network_mode: host`: `/proc/net/dev` and the IP addresses are the Pi's.
- `pid: host`: the process count and `/proc/1/mounts` (the host's mount
  table, used to find disks) are the Pi's.
- `/` mounted read-only at `/hostfs`: `/sys` (temperatures, hwmon, CPU
  frequency, device tree with the PSU current), `/etc/os-release`, and every
  mounted filesystem for `statfs`. Podman masks `/sys/firmware` in the
  container's own `/sys`, which is why the host copy is used.
- the firmware device mapped to `/dev/vcio_gencmd`, plus
  `group_add: keep-groups` so the container keeps your `video` group.

The containers card reads Podman's own state database (`db.sql`, read-only,
Podman 4.8+) and each container's `healthcheck.log` through `/hostfs`, and
CPU/memory from the container's process tree in `/proc`. Connections come from `/proc/net/tcp{,6}`;
sockets of root-owned daemons (e.g. sshd) can't be attributed to a process,
so they are labelled by well-known port instead.

### Starting and stopping apps

With `CONTAINER_CONTROL=true` the apps card gets a START or STOP button per
container (STOP needs a second click to confirm). The dashboard calls the
Podman REST API on your user's `podman.socket`, reached through the read-only
`/hostfs` mount (read-only doesn't block connecting to a socket), so no extra
mount is needed. Notes:

- It only starts containers that exist, i.e. apps installed with their
  `install.sh`/`start.sh`; an app removed with `podman compose down` or
  `uninstall.sh` has to be started from its directory again.
- The dashboard's own container has no button.
- A stopped app stays stopped until you start it, but comes back after a
  reboot (`podman-restart.service` starts every `restart: always`
  container).
- There is no login: anyone who can open the dashboard can stop apps. Leave
  it off, or set `BIND_ADDRESS=127.0.0.1`, on networks you don't trust. The
  socket gives full control over your Podman containers, so the app only
  exposes start and stop, and requires an `X-Pi-Monitor: 1` header so other
  web pages can't trigger it.

With `CONTAINER_CONTROL=false` (the default) nothing talks to the socket and
the dashboard can see containers but never start, stop or exec into them.

The container runs as its root user, which under rootless Podman is your own
unprivileged user on the host.

## Uninstall

```sh
./uninstall.sh            # asks before deleting anything
./uninstall.sh --purge    # also deletes DATA_DIR (history) and .env
```

Always removes the container and the `pi-monitor` image. The history in
`DATA_DIR` is kept unless you confirm deleting it (or pass `--purge`), and
`.env` stays as long as the history does, so a later `./install.sh` picks it
up again. Podman, `podman-restart.service` and lingering are left alone for
the other apps.

## API

| Endpoint | Description |
|---|---|
| `GET /api/status` | Healthcheck: 200 while samples are fresh |
| `GET /api/snapshot` | Latest full reading as JSON |
| `GET /api/history` | 24 h minute history and power events |
| `POST /api/containers/:name/start` / `stop` | Start or stop a container by name (needs `CONTAINER_CONTROL=true` and the header `X-Pi-Monitor: 1`) |
| Socket.IO `init` / `snapshot` | `init` on connect (snapshot, history, events), then `snapshot` on every sample |

## Development

```sh
npm install
npm run dev      # builds and serves on :8080 (needs Linux /proc and /sys)
```

Code layout: `src/metrics/collector.service.ts` reads `/proc`, `/sys` and
`vcgencmd`; `history.service.ts` keeps the ring buffers and the event log;
`metrics.gateway.ts` pushes over WebSockets; `public/` is the plain
HTML/CSS/JS dashboard.

The UI is built on the shared Outpost package in [`/ui`](../../ui/README.md)
(module "System"). `install.sh` and `start.sh` copy it into `public/ui/`
(gitignored) before building, and the image serves it at `/ui/`. Change the
package in `/ui`, never the copy; for local development run
`../../ui/sync.sh public/ui` once.
