# Plan: `apps/mesh`, Meshtastic gateway

## What it is

A web UI on the Pi for a Meshtastic LoRa node plugged in by USB. Anyone on
the hotspot can read the mesh's messages, see which nodes are around (and
where), and send messages, without owning a radio or installing an app.
The message history is kept on the Pi.

## Hardware (decide in M0)

- Any Meshtastic node with USB serial, e.g. Heltec V3, LilyGO T-Beam
  (has GPS), RAK WisBlock 4631 (lowest power). Buy at least **two** so you
  can test without a mesh nearby.
- Region **EU_868** (Switzerland). Antenna for 868 MHz, mounted high.
- Connected via USB to a powered hub (see power note in
  [README.md](README.md)). Shows up as `/dev/ttyACM0` or `/dev/ttyUSB0`;
  prefer the stable `/dev/serial/by-id/...` path in `.env`.
- Not chosen: a LoRa HAT with `meshtasticd` on the Pi. Fewer parts, but the
  node then dies with the Pi; a USB node can be unplugged and carried.

## Architecture

- **Language: Python**, unlike the NestJS apps. The official `meshtastic`
  Python package is the reference implementation (serial + TCP interfaces,
  pubsub events, node DB) and ships the `meshtastic` CLI, which `manage.sh`
  uses for node configuration. FastAPI + uvicorn for HTTP/WebSocket.
- **Container:** `python:<version>-slim` (pinned), `pip install` pinned
  `meshtastic`, `fastapi`, `uvicorn`. Runs as a non-root user (uid 1000)
  with `userns_mode: keep-id` + `x-podman: { in_pod: false }` (see
  `apps/maps`), `devices: ${MESH_DEVICE}:/dev/meshtastic`,
  `group_add: [keep-groups]` for `dialout`.
- **Connection:** `MESH_CONNECTION=serial` (default, `/dev/meshtastic`) or
  `tcp` (`MESH_HOST`, port 4403) for a node on WiFi. Reconnect with backoff
  when the node is unplugged; the UI shows "radio disconnected" instead of
  the app crashing.
- **Storage:** SQLite at `${DATA_DIR}/mesh.db`, tables `messages`
  (id, time, from, to, channel, text, rx_snr, rx_rssi, hop_count,
  direction, ack state) and `nodes` (last seen, name, battery, position).
  Writes only on new packets, so SD card friendly.
- **API:** `GET /api/status`, `GET /api/messages?channel&before`,
  `GET /api/nodes`, `POST /api/messages`, `WS /api/live` (new messages,
  node updates, connection state).
- **Frontend:** static vanilla HTML/JS/CSS served by FastAPI (same style
  as `apps/monitor/public`), mobile-first: channel tabs, message list,
  composer, node list with "last heard" and battery.
- **Sending from the web:** every web message goes out from the gateway's
  node, so prefix it with the sender's chosen name (`[Anna] ...`, name
  stored in `localStorage`). Enforce the payload limit (about 200 bytes,
  count UTF-8 bytes, not characters) and a per-client rate limit, because
  airtime is shared and duty-cycle limited. Optional `SEND_PIN` so not
  everyone on the hotspot can transmit.
- **Channels:** keep the public default channel for strangers, and add a
  private channel (own PSK) for family/neighbours. Configured on the node
  via `manage.sh`, not in the app.

## `.env` variables

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8084` | |
| `BIND_ADDRESS` | `0.0.0.0` | |
| `DATA_DIR` | `./data` | `mesh.db`; small, SD card is fine |
| `MESH_CONNECTION` | `serial` | `serial` or `tcp` |
| `MESH_DEVICE` | `/dev/ttyACM0` | install.sh suggests `/dev/serial/by-id/*` |
| `MESH_HOST` | | Only for `tcp` |
| `SEND_PIN` | | Empty: anyone on the network can send |
| `SEND_RATE_LIMIT` | `5/min` | Per client IP |

## Sessions

### M0: Hardware and spike
**Goal:** prove the radio and library work on the Pi before building an app.

- [ ] Flash current Meshtastic firmware on both nodes (web flasher, from
      the Mac), set region `EU_868`, set owner names.
- [ ] On the Pi, in a throwaway `python:slim` container with the device
      passed through: `meshtastic --port /dev/meshtastic --info`, send and
      receive a text between the two nodes.
- [ ] Note in this file: device path, which group owns it, whether
      `keep-groups` was enough under rootless Podman, current library
      version to pin.

**Done when:** a message typed on node B appears in a Python script on the
Pi, and vice versa.

### M1: Scaffold and connection
- [ ] `apps/mesh/` layout per AGENTS.md; `install.sh` lists serial devices
      (`/dev/serial/by-id/*`) and asks which one, checks `dialout`
      membership (offer `sudo usermod -aG dialout`, needs re-login).
- [ ] `app/radio.py`: connect, reconnect with backoff, expose state.
- [ ] `GET /api/status` (connected, node id, firmware, channel list) and a
      `CMD-SHELL` healthcheck on it. Healthcheck reports the HTTP server,
      not the radio, so an unplugged node doesn't restart-loop the
      container.

**Done when:** status shows the node; unplugging and replugging it
recovers without restarting the container.

### M2: Receive and persist
- [ ] SQLite schema + migrations (plain `user_version` pragma is enough).
- [ ] Store incoming text messages and node info/position/telemetry
      updates; dedupe by packet id.
- [ ] `GET /api/messages`, `GET /api/nodes`, `WS /api/live`.

**Done when:** messages sent from node B survive a container restart and
show up in the API.

### M3: Web UI and sending
- [ ] Message view per channel and direct messages, live updates.
- [ ] Composer with name prefix, byte counter, send state
      (queued / sent / acked where available).
- [ ] `POST /api/messages` with byte limit, rate limit, optional PIN.
- [ ] Node list: name, last heard, hops, SNR, battery, distance if both
      sides have a position.

**Done when:** a phone on the hotspot can send to node B and read its
replies, with nothing installed on the phone.

### M4: Management, maps, portal, docs
- [ ] `manage.sh`: `status`, `logs`, `node-info`, `set-region`,
      `set-name`, `add-channel <name>` (generates a PSK and prints the
      share URL/QR as text), `export` (messages to CSV). Config commands
      stop the service, run `meshtastic` CLI via `compose run --rm`, then
      start it again (the serial port can only be opened once).
- [ ] Node positions: link each node to the maps app
      (`http://<host>:8081/#<zoom>/<lat>/<lon>` or whatever URL format
      `apps/maps` supports; check its frontend first).
- [ ] Add mesh to the portal's default `apps.json`.
- [ ] `README.md` (incl. hardware list, channel/PSK explanation, duty
      cycle note), root `README.md` row.

**Done when:** a fresh clone with a node plugged in only needs
`./install.sh`, and the portal shows the mesh tile.
