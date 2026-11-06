# offline-pi

A collection of self-hosted apps meant to run fully offline (e.g. on a
Raspberry Pi), with no runtime dependency on the internet or a CDN once set up.

## Apps

| App | Default port | Description |
|---|---|---|
| [`apps/maps`](apps/maps/README.md) | `8080` | Self-hosted vector map tiles with a browser viewer: download a region once, then pan/zoom with no internet connection. Uses Podman Compose. |
| [`apps/knowledge`](apps/knowledge/README.md) | `8081` | Offline Wikipedia/reference content via `kiwix-serve`, managed with install/catalog scripts. Uses Podman Compose. |

See each app's own README for setup, architecture and usage details.

## Running an app

Every app under `apps/*` exposes the same two entry points:

```sh
cd apps/<app>
./install.sh   # one-time setup: install deps, build the image, bootstrap
./start.sh     # start (or restart) the app; safe to re-run after a reboot
```

`install.sh` is idempotent and ends by calling `start.sh`, so a fresh clone
only ever needs `./install.sh`. Use `./start.sh` on its own afterwards (e.g.
after a reboot, or once you've edited `.env`).

## Port allocation

Each app is a separate Podman Compose stack, so they're all meant to run side
by side on the same host (Pi). Default host ports are assigned per app and
kept out of each other's way — when adding a new app or changing a port, pick
one that isn't already listed above and isn't a well-known port already used
elsewhere on the host.
