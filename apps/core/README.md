# core: dashboard, gateway and module supervisor

core is the part of offline-pi that always runs and the only one the LAN
reaches (`PORT`, 8080). It serves:

- `/`: the **home page**: every installed module as a tile (open it) and an
  on/off switch (start/stop its container), plus a banner when a stopped or
  missing module was opened;
- `/system/`: the **System module**, a realtime dashboard of the Pi (below);
- `/<module>/`: every installed module, through a streaming reverse proxy
  (`src/gateway/gateway.ts`) to its loopback port, WebSockets, SSE and HTTP
  range requests included. A stopped module redirects page loads to the home
  page; API calls get `503`;
- `/ui/`: the shared Outpost package; `/api/*`: core's API.

Built with NestJS and Socket.IO; fully offline: no CDN, no external fonts or
chart libraries.

## Modules and start/stop

core reads the module manifests (`apps/*/module.json`; its Dockerfile copies
every one into the image, in development it reads the checkout) for the home page, the nav
(`/api/modules`, used by `outpost.js` in every module) and the gateway
routes. Installed = listed in `MODULES` (`.env`).

Modules are started and stopped through the Podman REST API on your user's
`podman.socket` (`PODMAN_SOCKET`, detected by `install.sh`), reached through
the read-only `/hostfs` mount (read-only doesn't block connecting to a
socket). The modules switched off are kept in `CORE_DATA_DIR/modules.json`.
When core starts (after `./start.sh`, or after a reboot via
`podman-restart.service`) it starts every installed module that is switched
on and configured (`requires` in its manifest), dependencies first, and stops
the ones switched off. A crash in between is handled by Podman
(`restart: on-failure`); a stop isn't undone.

There is no login: anyone who can open the dashboard can switch modules.
Set `CONTROL_PIN` to require a PIN, or `BIND_ADDRESS=127.0.0.1`. The socket
gives full control over your Podman containers, so core only exposes start
and stop of module containers, and requires an `X-Pi-Monitor: 1` header so
other web pages can't trigger it.

## The System module

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
| **Apps & containers** | Every Podman container (running and stopped) with its module, state, health check result, path or ports, uptime, CPU and memory; START/STOP per module |
| **Connections** | Ports open on the Pi and who listens on them, active TCP connections (direction, remote address, local port, app/process), counts per state; loopback hidden by default |
| **System** | Hostname, model, OS, kernel, uptime, process count |
| **Power events** | Log of when under-voltage/throttling started and ended |

Temperature, input voltage, CPU, memory and network have charts for the
last 15 minutes or the last 24 hours (one point per minute; the voltage chart
keeps each minute's *lowest* value so short dips stay visible). The 24 h
history and the event log survive restarts (`CORE_DATA_DIR/history.json`).

## Configuration

Set in the root `.env` (see the root README); the ones specific to core:

| Variable | Default | Description |
|---|---|---|
| `PORT` / `BIND_ADDRESS` | `8080` / `0.0.0.0` | Where offline-pi is reachable. |
| `CORE_DATA_DIR` | `./data/core` | `history.json` (24 h history + power events, < 1 MB) and `modules.json`. |
| `SAMPLE_INTERVAL_MS` | `2000` | How often the Pi is sampled and pushed to dashboards (min 500). Containers and connections refresh every 5 s. |
| `CONTROL_PIN` | empty | PIN for starting/stopping modules (asked once per browser tab). |
| `PODMAN_GRAPH_ROOT` | from `podman info` | Host path of Podman's storage, whose `db.sql` lists the containers. Empty = search the default locations. |
| `PODMAN_SOCKET` | from `podman info` | Host path of your Podman API socket (module start/stop). |
| `VCIO_DEVICE` | `/dev/vcio_gencmd` | Firmware mailbox for `vcgencmd` (`/dev/null` if not a Pi). |

The last three are detected by `install.sh` on every run. The voltage and
throttle readings need your user in the `video` group (default on Pi OS).
core also gets the whole `.env` (`env_file`), because module manifests refer
to module settings (ports, `requires`).

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

The container runs as its root user, which under rootless Podman is your own
unprivileged user on the host.

## API

| Endpoint | Description |
|---|---|
| `GET /api/status` | Healthcheck: 200 while samples are fresh |
| `GET /api/snapshot` | Latest full reading as JSON |
| `GET /api/history` | 24 h minute history and power events |
| `GET /api/modules` | Every module: manifest fields, installed, switched on, container state and health, missing settings |
| `POST /api/modules/:id/start` / `stop` | Switch a module on/off (header `X-Pi-Monitor: 1`; `X-Control-Pin` when `CONTROL_PIN` is set) |
| Socket.IO `init` / `snapshot` | `init` on connect (snapshot, history, events), then `snapshot` on every sample |

## Development

From the repo root (core is the workspace `@offline-pi/core`):

```sh
npm install         # once, every workspace
npm run dev:core    # builds and serves on :8080 (needs Linux /proc and /sys)
```

For the gateway without containers, point it at the module ports by hand:
`MODULES=maps MAPS_PORT=8081 npm run dev:core` (the manifests come from
`apps/*/module.json`; `APPS_DIR` overrides where they are read).

Code layout:
- `src/metrics/`: `collector.service.ts` reads `/proc`, `/sys` and
  `vcgencmd`; `history.service.ts` keeps the ring buffers and the event log;
  `runtime.service.ts` reads Podman's state DB and the TCP sockets;
  `metrics.gateway.ts` pushes over Socket.IO.
- `src/modules/`: `registry.ts` loads the manifests, `modules.service.ts`
  keeps the desired state and reconciles, `podman.service.ts` talks to the
  socket, `modules.controller.ts` is `/api/modules`.
- `src/gateway/gateway.ts`: the reverse proxy.
- `public/`: home page (`index.html`, `home.js`), `system/` dashboard,
  `modules.js` (shared start/stop client).
- `/ui/` is the workspace [`@offline-pi/ui`](../../packages/ui/README.md)
  (`packages/ui`), a dependency of core, served straight from where it
  resolves (`src/main.ts`).
