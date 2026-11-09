# mesh

A web UI for a [Meshtastic](https://meshtastic.org) LoRa node plugged into the
Pi by USB. Open `http://<pi>:8080/mesh/` in any browser on the hotspot or
LAN to:

- read and send messages on the node's channels (e.g. the public `LongFast`
  channel and a private family channel),
- send and receive direct messages to/from individual nodes, with delivery
  state (sending, sent to mesh, delivered, failed),
- see which nodes are around: last heard, hops, signal, battery, distance,
  and "Show on map": to the Mesh map module (`/mesh-map/`,
  [`services/mesh-map`](../mesh-map/README.md)) when installed, which shows
  every node with a position on an offline map (updated live), otherwise to
  Maps (`/maps/`). Which one comes from core's module list; without either
  the links are hidden.

The message history and node list are kept on the Pi (SQLite), so they
survive restarts and are readable even while the radio is unplugged.

Scope: the web UI talks **as the Pi's node**. Everyone else uses their own
Meshtastic node (companion radio + Meshtastic app) and reaches the Pi over
LoRa. The module is reached only through core at `/mesh/`: no Meshtastic
TCP API, no port forwarding or router config.

## Requirements

- offline-pi installed with the `mesh` module (root `./install.sh`; see the
  root README for install, start and uninstall).
- A Meshtastic node with USB serial, e.g. RAK WisBlock 4631, Seeed XIAO
  nRF52840 kit, Seeed Wio Tracker L1 Pro, Heltec V3, LilyGO T-Beam. nRF52
  boards draw the least power. Plug it into a **powered USB hub** if the Pi's
  supply is already at its limit.
- **868 MHz** hardware and region `EU_868` in Switzerland/EU, with an
  868 MHz antenna. Never power a LoRa radio without its antenna.
- A second node (yours, with the phone app) to talk to.

Flash current firmware with the [web flasher](https://flasher.meshtastic.org)
before plugging the node into the Pi.

## Setup

The module's configure hook (`lib/modules/mesh.sh`), run by the root
`./install.sh`:

1. On first run asks for the connection type (USB serial or TCP) and an
   optional send PIN.
2. Asks where to store the history (`MESH_DATA_DIR`, every run). A new path
   moves the existing data there after confirmation.
3. Lists the plugged-in serial devices (`/dev/serial/by-id/*`) and asks which
   one is the node (every run, so you can switch nodes). Checks your user can
   open it (offers `sudo usermod -aG dialout $USER`; log in again afterwards)
   and warns if ModemManager is running (it can grab the port). If no node is
   plugged in, mesh stays unconfigured (`MESH_CONNECTION` empty) and core
   won't start it until `./install.sh` is re-run.

## Configuration

Set in the root `.env` (see the root README):

| Variable | Default | Description |
|---|---|---|
| `MESH_DATA_DIR` | `./data/mesh` | `mesh.db` (SQLite, small). SD card is fine; can point at an SSD mount. |
| `MESH_PORT` | `8084` | Internal port (loopback only), proxied by core at `/mesh/`. |
| `MESH_CONNECTION` | empty | `serial` (USB node) or `tcp` (node on the network); empty = not configured. |
| `MESH_DEVICE` | `/dev/null` | Set by `install.sh` to the node's `/dev/serial/by-id/...` path; `/dev/null` for `tcp`. |
| `MESH_HOST` | empty | Node hostname/IP for `tcp` (port 4403). |
| `MESH_SEND_PIN` | empty | PIN required to send from the web UI; empty = anyone who can open it. |
| `MESH_SEND_RATE_LIMIT` | `5/min` | Per client IP, e.g. `30/hour`; `0` = off. |

## Day to day: `manage.sh`

```sh
./manage.sh mesh status                 # radio state, node, channels
./manage.sh logs mesh                   # follow logs
./manage.sh mesh export messages.csv    # all messages as CSV
./manage.sh start|stop mesh             # or the switch on the home page
```

Node configuration uses the official `meshtastic` CLI from the module's
image. Only one program can open the serial port, so these commands stop the
module for a few seconds and start it again afterwards:

```sh
./manage.sh mesh info                       # full node config, channels, node DB
./manage.sh mesh set-name "Pi Base" PI      # name others see
./manage.sh mesh set-region EU_868
./manage.sh mesh fixed-position 47.37 8.54  # fixed position, GPS off
./manage.sh mesh add-channel Family         # private channel with a random key
./manage.sh mesh share                      # channel URL + QR code for the other nodes
./manage.sh mesh cli --get lora             # any other meshtastic CLI command
```

### Channels

Channel 0 (primary) is usually the public default (`LongFast`): anyone with
default settings nearby can read it. For family or neighbours, add a private
channel (`./manage.sh mesh add-channel Family`), then scan the QR code from
`./manage.sh mesh share` with the Meshtastic app on each other node. Every
channel configured on the node shows up in the web UI automatically.

### Airtime

LoRa is slow and shared. In `EU_868` each node may transmit at most 10% of
the time, and a message can take a few seconds on air. Keep messages short
(the UI enforces 200 bytes, emoji and umlauts count double or more) and
don't spam: `MESH_SEND_RATE_LIMIT` limits each browser.

## How it works

- The service `mesh` in `compose.yml` in the repo root runs as container
  `offline-pi-mesh` (image `localhost/offline-pi-mesh`) with host
  networking, bound to `127.0.0.1:MESH_PORT`. The page uses page-relative
  URLs, so it works under `/mesh/`.
- Python: FastAPI + uvicorn, the official `meshtastic` library, SQLite.
  Static vanilla HTML/JS/CSS (no CDN, works offline).
- The look (status strip, header, module nav, chat bubbles, lists, fonts,
  icons) comes from the shared Outpost UI package in `ui/` in the repo root
  (see `DESIGN.md`). mesh doesn't bundle it: the page loads `/ui/` from
  core.
- The app owns the serial port. It reconnects with backoff when the node is
  unplugged or reboots; the UI shows "Radio disconnected" meanwhile and keeps
  showing the history.
- API (under `/mesh/`): `GET /api/status`, `GET /api/conversations`,
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
  must be plugged in when the app starts . If it comes back under a different
  device after replugging, re-run `./install.sh` to pick it.
- Messages typed on the node itself (e.g. canned messages on a Wio
  Tracker's buttons) probably don't appear in the web UI, since the node
  only reports received packets over serial. Not verified yet.

## Development

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest tests     # uses a fake radio, no hardware needed
```

`./uninstall.sh` keeps the history in `MESH_DATA_DIR` unless you confirm
deleting it. Node configuration lives on the node itself and is not touched.
