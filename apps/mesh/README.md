# mesh

A web UI for a [Meshtastic](https://meshtastic.org) LoRa node plugged into the
Pi by USB. Open `http://<pi>:8084` in any browser on the hotspot or LAN to:

- read and send messages on the node's channels (e.g. the public `LongFast`
  channel and a private family channel),
- send and receive direct messages to/from individual nodes, with delivery
  state (sending, sent to mesh, delivered, failed),
- see which nodes are around: last heard, hops, signal, battery, distance,
  and "Show on map" via [`apps/mesh-map`](../mesh-map/README.md), which
  shows every node with a position on an offline map (updated live).

The message history and node list are kept on the Pi (SQLite), so they
survive restarts and are readable even while the radio is unplugged.

Scope: the web UI talks **as the Pi's node**. Everyone else uses their own
Meshtastic node (companion radio + Meshtastic app) and reaches the Pi over
LoRa. The app exposes only its web port: no Meshtastic TCP API, no port
forwarding or router config. Uses Podman Compose.

## Requirements

- Raspberry Pi (or any Linux host) with Podman; `install.sh` offers to
  install it.
- A Meshtastic node with USB serial, e.g. RAK WisBlock 4631, Seeed XIAO
  nRF52840 kit, Seeed Wio Tracker L1 Pro, Heltec V3, LilyGO T-Beam. nRF52
  boards draw the least power. Plug it into a **powered USB hub** if the Pi's
  supply is already at its limit.
- **868 MHz** hardware and region `EU_868` in Switzerland/EU, with an
  868 MHz antenna. Never power a LoRa radio without its antenna.
- A second node (yours, with the phone app) to talk to.

Flash current firmware with the [web flasher](https://flasher.meshtastic.org)
before plugging the node into the Pi.

## Quick start

```sh
git clone <this repo> offline-pi
cd offline-pi/apps/mesh
./install.sh
```

Then open the printed URL (port `8084`).

## What `install.sh` does

1. Checks for Podman and a compose backend (offers to install via `apt`).
2. If there is no `.env`: copies `.env.example` and asks for port, bind
   address, connection type (USB serial or TCP) and an optional send PIN.
3. Asks where to store the history (`DATA_DIR`, every run). A new path moves
   the existing data there after confirmation.
4. Lists the plugged-in serial devices (`/dev/serial/by-id/*`) and asks which
   one is the node (every run, so you can switch nodes). Checks your user can
   open it (offers `sudo usermod -aG dialout $USER`; log in again afterwards)
   and warns if ModemManager is running (it can grab the port).
5. Builds the image, enables `podman-restart.service` and lingering so the
   app comes back after a reboot, then runs `./start.sh`.

## Configuration (`.env`)

| Var | Default | Notes |
|---|---|---|
| `DATA_DIR` | `./data` | `mesh.db` (SQLite, small). SD card is fine; can point at an SSD mount, e.g. `/mnt/ssd/mesh/data` |
| `PORT` | `8084` | Web UI. Siblings: 8080 monitor, 8081 maps, 8082 knowledge, 8083 portal, 8085 radio, 8086 mesh-map |
| `BIND_ADDRESS` | `0.0.0.0` | `127.0.0.1` for this Pi only |
| `MESH_CONNECTION` | `serial` | `serial` (USB node) or `tcp` (node on the network) |
| `MESH_DEVICE` | `/dev/ttyACM0` | Set by `install.sh` to the node's `/dev/serial/by-id/...` path; `/dev/null` for `tcp` |
| `MESH_HOST` | | Node hostname/IP for `tcp` (port 4403) |
| `SEND_PIN` | | PIN required to send from the web UI; empty = anyone who can open it |
| `SEND_RATE_LIMIT` | `5/min` | Per client IP, e.g. `30/hour`; `0` = off |
| `MESH_MAP_PORT` | `8086` | Port of [`apps/mesh-map`](../mesh-map/README.md): lets that page read the node list (read-only) and is where "Show on map" goes; `off` disables both |
| `MAPS_PORT` | `8081` | Port of `apps/maps`, the "Show on map" target when `MESH_MAP_PORT` is `off`; `off` hides the links |

Edit `.env` and run `./start.sh` to apply. Re-running `./install.sh` with a
new `DATA_DIR` is the supported way to move the history (e.g. to a newly
mounted SSD) without losing it.

## Day to day: `manage.sh`

```sh
./manage.sh status                 # app + radio state, node, channels
./manage.sh logs                   # follow logs
./manage.sh export messages.csv    # all messages as CSV
```

Node configuration uses the official `meshtastic` CLI from the app's image.
Only one program can open the serial port, so these commands stop the app
for a few seconds and start it again afterwards:

```sh
./manage.sh info                       # full node config, channels, node DB
./manage.sh set-name "Pi Base" PI      # name others see
./manage.sh set-region EU_868
./manage.sh fixed-position 47.37 8.54  # fixed position, GPS off
./manage.sh add-channel Family         # private channel with a random key
./manage.sh share                      # channel URL + QR code for the other nodes
./manage.sh cli --get lora             # any other meshtastic CLI command
```

### Channels

Channel 0 (primary) is usually the public default (`LongFast`): anyone with
default settings nearby can read it. For family or neighbours, add a private
channel (`./manage.sh add-channel Family`), then scan the QR code from
`./manage.sh share` with the Meshtastic app on each other node. Every
channel configured on the node shows up in the web UI automatically.

### Airtime

LoRa is slow and shared. In `EU_868` each node may transmit at most 10% of
the time, and a message can take a few seconds on air. Keep messages short
(the UI enforces 200 bytes, emoji and umlauts count double or more) and
don't spam: `SEND_RATE_LIMIT` limits each browser.

## How it works

- The container uses `network_mode: host` (no port mapping, no Podman
  bridge), so the app binds `PORT` directly on the Pi's own interfaces
  instead of going through Podman's bridge network and `aardvark-dns`, which
  can get stuck after the host's network changes (e.g. a Wi-Fi reconnect).
- Python: FastAPI + uvicorn, the official `meshtastic` library, SQLite.
  Static vanilla HTML/JS/CSS (no CDN, works offline).
- The look (status strip, header, module nav, chat bubbles, lists, fonts,
  icons) comes from the shared Outpost UI package in the repo's `/ui`
  (see `DESIGN.md`). `install.sh` and `start.sh` copy it into `public/ui/`
  (gitignored) before building; the image build fails if it is missing. For
  local development run `../../ui/sync.sh public/ui` once.
- The app owns the serial port. It reconnects with backoff when the node is
  unplugged or reboots; the UI shows "Radio disconnected" meanwhile and keeps
  showing the history.
- `GET /api/status`, `GET /api/conversations`,
  `GET /api/messages?conv=ch:0|dm:<node num>&before=<id>`, `GET /api/nodes`,
  `POST /api/messages {conv, text}` (header `X-Send-Pin` if set),
  `WS /api/live` (status, message, node events).
- Outgoing messages are sent with `wantAck`. The state goes from *sending*
  to *sent to mesh* (a neighbour rebroadcast it) and, for direct messages,
  *delivered* (the recipient confirmed). No ack within 2 minutes = *failed*.
- The container runs as its root user, which under rootless Podman is your
  own unprivileged user; `group_add: keep-groups` passes your `dialout`
  membership through to the serial device.

### Known limitations

- Podman maps the serial device when the container is created. The node
  must be plugged in when the app starts (`start.sh` checks this). If it
  comes back under a different device after replugging, run `./start.sh`.
- Messages typed on the node itself (e.g. canned messages on a Wio
  Tracker's buttons) probably don't appear in the web UI, since the node
  only reports received packets over serial. Not verified yet.

## Development

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests     # uses a fake radio, no hardware needed
```

## Uninstall

```sh
./uninstall.sh            # asks before deleting the history
./uninstall.sh --purge    # also deletes DATA_DIR and .env
```

Always removes the container and the `offline-pi-mesh` image. The history in
`DATA_DIR` is kept unless you confirm deleting it, and `.env` is kept as long
as the data is, so `./install.sh` finds it again. Podman, lingering and your
`dialout` group membership are left alone. Node configuration lives on the
node itself and is not touched.
