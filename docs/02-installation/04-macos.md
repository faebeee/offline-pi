# macOS (development)

The same scripts run on a Mac, which is handy for development and for
trying offline-pi out. Bash 3.2 (the version macOS ships) is enough. This
page lists what differs from a Pi.

## Podman on a Mac

On macOS, Podman runs its containers in a small Linux virtual machine, the
**Podman machine**. In step 1, `install.sh`:

- offers to install Podman and `podman-compose` with
  [Homebrew](https://brew.sh) if they are missing,
- offers to create and start the Podman machine (`podman machine init
  --now`; this downloads its image once), or starts it if it is stopped.

`start.sh` also starts a stopped Podman machine before it does anything
else.

## Differences from a Pi

| Topic | On macOS |
|---|---|
| Compose backend | Always `podman-compose`, with `compose.macos.yml` added on top of `compose.yml`. `podman compose` could hand over to Docker Compose, which resolves bind mounts on the Mac instead of in the machine. |
| Device groups | `compose.macos.yml` removes `group_add: keep-groups` from core and Mesh: the remote Podman API rejects it, and the Pi devices it is for do not exist on a Mac. |
| Network | The containers' host network is the Podman machine's. `start.sh` forwards `PORT` from the Mac into the machine on every start. |
| Data directories | Must be under a path the machine shares: `/Users`, `/private`, `/var/folders` (or `/tmp`). `install.sh` warns otherwise, because the containers would see an empty directory. |
| Mesh | USB devices cannot reach the machine. Mesh needs a Meshtastic node on the network (`MESH_CONNECTION=tcp`, by hostname or IP); `install.sh` does not offer USB. |
| System screen | No Pi hardware: no voltage or throttling readings. |
| Autostart | Nothing starts at login. After a restart of the Mac, run `podman machine start` and `./start.sh`. |
| `podman.socket` | Not enabled on the Mac; the socket lives in the Podman machine, which is where core runs. |

## Port forwarding

The forwarding of `PORT` from the Mac into the machine is not permanent.
`start.sh` sets it up on every run. If `BIND_ADDRESS` is `127.0.0.1`, only
the Mac itself can open offline-pi; otherwise other devices on your network
can too.

If `start.sh` prints

```
[warn] Could not forward port 8080 from the Mac into the Podman machine.
```

the containers may be running, but `http://localhost:8080` does not answer
from the Mac. Run `./start.sh` again. If that does not help, restart the
machine (`podman machine stop`, then `./start.sh`).

## Developing without containers

For work on the code you do not need the containers at all: core and the
web app run with `npm run dev:core` and `npm run dev:web`. See
[Monorepo and builds](../06-development/02-monorepo-and-builds.md).
Some System readings need Linux `/proc` and `/sys` and stay empty on a Mac.

## See also

- [Install](01-install.md)
- [Storage and SSD](02-storage.md)
- [Troubleshooting](../04-operations/05-troubleshooting.md#mac-the-web-app-does-not-answer)
