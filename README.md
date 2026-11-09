# offline-pi

A collection of self-hosted apps meant to run fully offline (e.g. on a
Raspberry Pi), with no runtime dependency on the internet or a CDN once set up.

## Apps

| App | Default port | Description |
|---|---|---|
| [`apps/monitor`](apps/monitor/README.md) | `8080` | Realtime Pi dashboard (NestJS + WebSockets): temperature, input voltage, throttling, PSU limits, CPU, memory, storage and network. Uses Podman Compose. |
| [`apps/maps`](apps/maps/README.md) | `8081` | Self-hosted vector map tiles with a browser viewer: download a region once, then pan/zoom with no internet connection. Uses Podman Compose. |
| [`apps/knowledge`](apps/knowledge/README.md) | `8082` | Offline emergency-knowledge library via `kiwix-serve`; the container downloads the ZIM set from `zims.txt` itself. Uses Podman Compose. |
| [`apps/mesh`](apps/mesh/README.md) | `8084` | Web UI for a USB Meshtastic LoRa node: send/receive channel and direct messages, node list, history kept on the Pi. Uses Podman Compose. |
| [`apps/mesh-map`](apps/mesh-map/README.md) | `8086` | Offline map of the Meshtastic nodes heard by `apps/mesh`, updated live; reuses `apps/maps`' downloaded regions read-only. Uses Podman Compose. |

See each app's own README for setup, architecture and usage details.

All web UIs share one look and feel, the Outpost design system:
[`DESIGN.md`](DESIGN.md) is the spec and [`ui/`](ui/README.md) the shared
package (tokens, fonts, icons, components) every app builds from. Each app's
`install.sh`/`start.sh` copies it in before building.

## Running an app

Every app under `apps/*` exposes the same three entry points:

```sh
cd apps/<app>
./install.sh     # one-time setup: install deps, build the image, bootstrap
./start.sh       # start (or restart) the app; safe to re-run after a reboot
./uninstall.sh   # remove containers and image; asks before deleting data
```

`install.sh` is idempotent and ends by calling `start.sh`, so a fresh clone
only ever needs `./install.sh`. Use `./start.sh` on its own afterwards (e.g.
after a reboot, or once you've edited `.env`).

`./uninstall.sh` stops and removes the app's containers and image. Data
directories are kept unless you confirm deleting each one (or pass
`--purge`), and `.env` stays as long as data does, so `./install.sh` picks it
up again. `apps/hotspot-pi` is a host service rather than a container; it has
`install-hotspot-fallback.sh` / `uninstall-hotspot-fallback.sh` instead.

## Port allocation

Each app is a separate Podman Compose stack, so they're all meant to run side
by side on the same host (Pi). Default host ports are assigned per app and
kept out of each other's way — when adding a new app or changing a port, pick
one that isn't already listed above and isn't a well-known port already used
elsewhere on the host.
