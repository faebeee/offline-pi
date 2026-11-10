# Changelog

What changed in each version of outpost, newest first. The version you run
is shown at the bottom of the Info module's contents and by
`./update.sh --check`. How versions are made is described in
[Releases](06-development/10-releases.md).

Each version lists its changes under **Added**, **Changed**, **Fixed** and
**Removed**. Changes that are done but not released yet are collected
under **Unreleased**.

## Unreleased

### Changed

- Mesh map is now part of Maps: the Meshtastic nodes are a layer of the
  offline map that you switch on and off with the nodes button in the map
  controls (remembered per browser), with a NODES tab in the panel. Mesh's
  SHOW ON MAP opens Maps on that node. Keep Maps (and Mesh) installed to
  see nodes; `./update.sh` or `./start.sh` removes the old mesh-map
  container and image by itself, `./install.sh` drops it from `MODULES`.
- Module numbers in the headers follow the new list: Maps 01, Mesh 02,
  Library 03, System 04, Logs 05, Info 06.

### Fixed

- `./update.sh` and `./start.sh --pull` failed with podman-compose
  (`argument --pull: invalid choice: 'core'`).
- Mesh: unplugging and replugging the radio stopped working after the
  first connection, since Podman mapped the USB device to a fixed
  major:minor at container creation and a replug usually gets a new
  `/dev/ttyACM*`/`/dev/ttyUSB*` node. The container now bind-mounts `/dev`
  read-only instead, so it always sees the current device behind the
  stable `/dev/serial/by-id/` path.


### Removed

- The `mesh-map` module (container, `/mesh-map` screen,
  `/api/mesh-map/overview`) and the `MESH_MAP_PORT` setting.

## 0.1.0 (2026-11-10)

The first versioned release: everything outpost could do up to this point.

### Added

- One app on one port: core (the API and the web app) with the modules
  Maps, Library, Mesh and Mesh map behind it, plus the System, Logs and
  Info screens.
- Maps: offline vector maps by region, downloads with progress, place
  search and points of interest.
- Library: offline Kiwix content (emergency knowledge, Wikipedia
  selections), with a catalog to download from the UI.
- Mesh: Meshtastic messaging over a USB or network node; Mesh map: the
  nodes of the mesh on the offline map.
- System: a live dashboard of the host (CPU, memory, temperatures, power,
  disks, network, containers); start and stop modules, protected by the
  control PIN.
- Logs: the logs of core and every module in one screen, with download.
- Info: this documentation in the app, with navigation and search.
- `install.sh`, `start.sh`, `update.sh`, `manage.sh` and `uninstall.sh`,
  on a Raspberry Pi (Linux) and on macOS with a Podman machine.
- Data directories that can be moved to an SSD.
- Versioning: the version in `package.json` and this changelog.

### Changed

- The project is called **outpost** now (it was offline-pi). Containers
  and images are named `outpost-*`; the first `./start.sh` or
  `./update.sh` replaces the old `offline-pi-*` ones and keeps the data.
