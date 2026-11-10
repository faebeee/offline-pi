# Glossary

Terms used across these docs and in the project, in alphabetical order.

| Term | Meaning |
|---|---|
| **api-client** | `@outpost/api-client` (`packages/api-client`): the web app's typed client, generated from core's OpenAPI document with `npm run api:gen`. |
| **Channel** | A Meshtastic group conversation. Every node on the same channel with the same key can read it. A node has a primary channel and optional secondary ones. |
| **Compose project** | The set of containers defined in `compose.yml`, always named `outpost`. Run through Podman Compose (`podman compose` or `podman-compose`). |
| **Core** | The part of outpost that always runs (`apps/core`, NestJS). The only service the network reaches: it serves the web app, the API, live updates and the passthrough, and starts and stops the modules. |
| **Domain** | One feature of core's API, a folder in `apps/core/src/domains/<name>/` with its routes under `/api/<name>/`. Usually one per module. |
| **dependsOn** | A manifest field: installed modules started together with this one (mesh map depends on mesh). |
| **Installed** | A module listed in `MODULES` in `.env`. It is built and has a container. Chosen with `./install.sh`. |
| **kiwix** | The open-source reader for ZIM files. The Library module runs `kiwix-serve`, which serves the books and their search. |
| **Lingering** | A systemd setting (`loginctl enable-linger`) that starts a user's services at boot without a login. Needed so rootless Podman brings core back after a reboot. |
| **LoRa** | Long Range: the low-power radio technique Meshtastic uses. Kilometres of range at a few hundred bytes per message. |
| **LoRa region** | The frequency band a Meshtastic node may use by law, for example `EU_868` or `US`. Set on the node; every node of a mesh must use the same one. |
| **Manifest** | A module's `apps/<name>/module.json`: id, label, path, port variable, health check, data directories, requirements. Core and the scripts read it. |
| **Meshtastic** | Open-source firmware for small LoRa radios that relay text messages for each other, with no internet or phone network. |
| **Mesh map** | The module that draws the Meshtastic nodes heard by Mesh on the map regions of Maps. |
| **Module** | One feature of outpost with its own container behind core (maps, knowledge, mesh, mesh-map), or a screen core serves itself (System, Logs, Info). |
| **Module gate** | The part of a screen that shows "not installed", "not configured" or "not running, START" instead of the screen while its module is not running. |
| **Node** | One Meshtastic radio. The node connected to the Pi is the own node; every other node it hears shows up in the node list and, with a position, on the mesh map. |
| **Outpost** | outpost's design system: tokens, fonts, icons, components, motion and illustrations in `packages/ui`, specified in `DESIGN.md`. |
| **Passthrough** | Core's streaming forwarder from `/svc/<module>/` to a module's container, for raw files the API doesn't wrap: map tiles, `.pmtiles` ranges, kiwix articles. |
| **PMTiles** | A single-file archive of map tiles that is read with HTTP range requests. Each map region is one `.pmtiles` file. |
| **Podman** | The container engine outpost uses, rootless (as your user, not root). Never Docker. |
| **Podman machine** | On macOS, the small Linux VM in which Podman runs the containers (`podman machine start`). |
| **podman.socket** | The user's Podman API socket. Core uses it to start and stop module containers. |
| **podman-restart.service** | A Podman systemd user service that starts the containers with `restart: always` (core) after a reboot. |
| **POI** | Point of interest: a place saved on the Maps screen, kept in the maps database. |
| **Reconcile** | What core does when it starts: bring every installed module into its desired state (started when switched on and configured, stopped when switched off). |
| **Region** | A map area downloaded on the Maps screen (a country or a smaller area), stored as one `.pmtiles` file in `MAPS_DATA_DIR`. |
| **requires** | A manifest field: settings that must be set before a module may start (mesh requires `MESH_CONNECTION`). |
| **Running** | A module whose container is up. |
| **Status strip** | The thin line at the top of every screen: the link LED (`<SOURCE> · <STATE>`), other facts and the UTC clock. |
| **Switched on / off** | Whether an installed module should run. Chosen on the home page, stored in `CORE_DATA_DIR/modules.json`, kept across reboots. |
| **Turborepo** | The build tool that runs `build`, `typecheck` and `dev` across the npm workspaces in the right order. |
| **Workspace** | One npm package of the monorepo (`@outpost/<name>`), in `apps/` or `packages/`. |
| **ZIM** | The file format of offline Wikipedia and other books. One file per book, read by kiwix. Stored in `KNOWLEDGE_CONTENT_DIR`. |

## Installed, switched on, running

Three states that are easy to mix up:

1. **Installed**: chosen in `./install.sh`, listed in `MODULES`. Only
   installed modules have a container.
2. **Switched on**: chosen on the home page. Core keeps it running and
   starts it again after a reboot.
3. **Running**: the container is up right now. A switched-on module may be
   briefly not running while it starts, after a crash, or when it is not
   configured (`requires`).

See [How it works](../01-overview/01-how-it-works.md) for the whole picture.
