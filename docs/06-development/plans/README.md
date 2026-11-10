# Implementation plans: portal, mesh, radio

> **Note (2026-11):** these plans predate the single-app layout. offline-pi
> is now one app (a Turborepo monorepo): modules live in `apps/<name>/` with
> a `module.json`, are served by core under a path on one port, and are
> configured through `lib/modules/<name>.sh` hooks (see
> [`AGENTS.md`](../../../AGENTS.md)). Read "default port" as the module's
> internal loopback port, and "a tile in the portal" as the home page tile
> core draws from the manifest. Mesh is implemented.

Plans for three new apps, split into sessions that can each be done (and
tested on the Pi) on their own. Every app follows [`AGENTS.md`](../../../AGENTS.md);
these plans only spell out what is specific to each app.

| Plan | App dir | Default port | Hardware needed |
|---|---|---|---|
| [portal.md](portal.md) | `apps/portal` | `8083` (+ port 80 redirect) | none |
| [mesh.md](mesh.md) | `apps/mesh` | `8084` | Meshtastic LoRa node (USB) |
| [radio.md](radio.md) | `apps/radio` | `8085` | RTL-SDR dongle + antenna |

## Recommended order

1. **Portal** (sessions P1 to P4). Everything else links into it, and it
   needs no hardware.
2. **Mesh** (M0 to M4). Most valuable for a real outage: text messages over
   several km with no infrastructure.
3. **Radio** (R0 to R4). Receive-only, so lower priority than mesh.

Mesh and radio are independent of each other; only their last session
(adding a tile to the portal) depends on the portal existing.

## How to use these plans in a session

- Start a session with: "Implement session `<ID>` from `docs/06-development/plans/<file>.md`".
- Each session lists **Goal**, **Tasks** and **Done when**. Only tick the
  checkboxes once "Done when" was verified on the Pi, not just on the Mac.
- If a session changes a decision in the plan (e.g. a spike picks the other
  option), update the plan file in the same session so the next one starts
  from the truth.
- Every session that adds or changes an app also updates the app's
  `README.md`; the last session of each app adds its row to the root
  `README.md`.

## Decisions that apply to all three

- **Ports:** 8080 monitor, 8081 maps, 8082 knowledge, 8083 portal,
  8084 mesh, 8085 radio. Document the sibling ports in each `.env.example`.
- **Host-level changes** (sysctl, nftables, kernel module blacklist, udev,
  NetworkManager dnsmasq snippets) are done by the app's `install.sh` via
  `sudo`, each in its own clearly named file
  (`/etc/.../offline-pi-<app>.conf`), and removed again by `uninstall.sh`.
  This keeps "every installer has an uninstaller" true.
- **USB devices in rootless Podman:** pass the device via `devices:` from a
  `.env` variable (as `apps/monitor` does with `VCIO_DEVICE`) and add
  `group_add: [keep-groups]` so the host user's `dialout` / `plugdev`
  membership carries over. `install.sh` checks the user is in that group.
- **Power:** the SSD already drops out under load on the 3A supply
  (see memory note, 2026-11-07). A Meshtastic node draws about 100 mA and an
  RTL-SDR about 300 mA. Plug both into a **powered USB hub**, and keep
  their data (message log, recordings) on the SD card until power is fixed.
  Keep writes small: append-only SQLite, no constant logging to disk.
- **Offline after install:** no CDN at runtime. Vendor any JS/CSS into the
  image at build time.
