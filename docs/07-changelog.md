# Changelog

What changed in each version of outpost, newest first. The version you run
is shown at the bottom of the Info module's contents and by
`./update.sh --check`. How versions are made is described in
[Releases](06-development/10-releases.md).

Each version lists its changes under **Added**, **Changed**, **Fixed** and
**Removed**. Changes that are done but not released yet are collected
under **Unreleased**.

## Unreleased

### Added

- Accounts and login: outpost is only open to logged-in accounts. On the
  first visit after installing (or after this update) the web app asks you
  to create the admin account, with a setup code that `./install.sh` and
  `./start.sh` print (also `./manage.sh users setup-code`), so only someone
  with access to the Pi can become admin. Admins add further accounts on the new Users
  screen (`/users`) and choose the role: `admin` or `user`. The account
  button in every header changes your password and logs you out. Forgot
  the admin password? `./manage.sh users reset-password NAME` on the Pi.
- System, Logs, Settings, Diagnostics and Users are for admins only:
  users don't see them, and core refuses their data to users. The status
  strip stays visible to everyone.
- One-line install:
  `curl -fsSL https://raw.githubusercontent.com/faebeee/offline-pi/main/get.sh | bash`
  installs git if needed, clones outpost to `~/outpost` and runs the
  installer.
- Ready-made images: every version's images are published for 64-bit
  Raspberry Pis and PCs, so installing and updating download them in a few
  minutes instead of building for 10 to 30 minutes on the Pi. Without
  published images (local changes, a fork) they are still built locally;
  `--build` forces that.
- outpost starts by itself when the Pi boots, and stops cleanly at
  shutdown, so a power cut no longer leaves it off. `./manage.sh autostart
  off` turns that off. Existing installs get it with the next
  `./install.sh` or `./update.sh`.
- Files (`/files`): a shared folder on the Pi. Everyone on its network can
  upload (button or drag and drop, with progress), make folders, rename,
  open and download files; deleting is for admins. Files are
  plain files in `FILES_DATA_DIR`; `FILES_MAX_UPLOAD_MB` and
  `FILES_MIN_FREE_MB` limit uploads. Part of outpost itself: always there.
- Board (`/board`): a notice board for notices, needs, offers and
  check-ins, no accounts needed. Needs and offers can be marked done;
  pinning and deleting are for admins. It is part of outpost
  itself (posts in `CORE_DATA_DIR/board.json`), so it is there after
  `./start.sh`, no install step needed.
- Supplies (`/supplies`): your emergency stock with quantities, places
  and best-before dates. Warns about expired, expiring and low items and
  shows how many days the water lasts for your household. Part of outpost
  itself (`CORE_DATA_DIR/supplies.json`): always there.
- Library: an "In an emergency" section on the library home with topics
  such as CPR, bleeding, burns, hypothermia and water purification; each
  opens the best article in your books. Without a searchable book it
  offers an emergency starter set (WikiMed, Military medicine, NHS
  Medicines, CD3WD), which CHOOSE BOOKS can also tick in one go.
- Network module (`/network`): who is on the Pi's Wi-Fi hotspot, with
  MAC address, vendor (looked up offline), IP, hostname, signal, traffic
  and the devices of the last 30 days. Devices can be blocked (with a
  note) and unblocked; a blocked device gets no traffic through the Pi.
  Blocking is enforced by a small host helper (`host/network-guard`,
  root, nftables). Re-run `./install.sh`, choose Network and let it
  install the helper.
- Network: `./install.sh` asks whether the Wi-Fi hotspot should be on or
  off (default: leave it) and on which Wi-Fi interface (also used at boot
  and watched by the Network screen), and `./manage.sh network hotspot on|off`
  switches it any time. It is on purpose not in the web app, so nobody can
  cut everyone off from a browser. It needs the hotspot fallback
  (`host/hotspot-pi`) and the current blocking helper: run
  `./manage.sh network install-guard` once on the Pi.
- Three new themes in the theme picker (the sun/moon button in the
  header): Night vision (red only, keeps your eyes used to the dark, the
  map is tinted red too), Terminal (green on black) and Paper (a warm
  light theme).
- Hotspot fallback: `sudo hotspot-fallback.sh --hotspot` opens the
  hotspot without looking for the preferred Wi-Fi. Re-run
  `sudo ./install-hotspot-fallback.sh` to get it.

- Hotspot fallback (`host/hotspot-pi`): started by hand
  (`sudo hotspot-fallback.sh`), the script lets you choose the Wi-Fi
  interface for the hotspot from a list and can save it as the boot
  default; `--iface <name>` skips the question. Re-run
  `sudo ./install-hotspot-fallback.sh` to get it.
- Maps: region downloads can be paused and resumed. What a download
  fetched is kept on the Pi, so after a pause, a dropped connection, an
  error or a restart, RESUME DOWNLOAD goes on from where it stopped
  instead of starting over. CANCEL AND DELETE throws it away. Unfinished
  downloads are listed on the Regions tab. While it downloads, a region
  needs about its archive size plus its download size of free space.
  Rebuild with `./start.sh` (or `./update.sh`) to get it.
- `./stop.sh` stops outpost (core, then every module). Nothing is removed
  and the module switches on the home page are kept; `./start.sh` starts
  it again.
- Settings (`/settings`): a new screen with every setting of the Pi, read
  only. It lists the `.env` values with their meaning and default (changed
  ones marked, PINs and passwords hidden) and every data folder with its
  path, drive, free space and size. Rebuild with `./start.sh` (or
  `./update.sh`) to get it.
- Diagnostics (`/diagnostics`): a new screen for troubleshooting. It
  checks whether every installed module runs and answers, whether each
  data folder exists, sits on its drive (not on the SD card because the
  USB drive is not mounted), is writable for the containers and has free
  space, plus the USB drive, Podman, power supply, temperature, memory and
  clock. Each problem comes with what to do; REPORT downloads the result as
  a text file. Rebuild with `./start.sh` (or `./update.sh`) to get it.
- The status strip shows `NET ONLINE` or `NET OFFLINE`: whether the Pi
  gets out to the internet. Core checks about once a minute against the map
  and library download servers; set `CORE_INTERNET_CHECK_URLS` empty to
  switch it off.
- Themes: the theme button in the header opens a theme picker with three
  new neon themes next to Outpost and Daylight: Neon (magenta on violet),
  Netrunner (cyan on deep blue) and Toxic (acid lime on black).
- The status strip at the top of every screen shows the Pi's vitals:
  CPU temperature, input voltage, CPU and memory usage and the system
  disk, in amber or red when they need attention.
- `host/usb-storage`: mounts a USB stick or SSD automatically at every
  boot and whenever it is plugged in, so maps and library data can live on
  it. Run `sudo host/usb-storage/install-usb-storage.sh`, then
  `./install.sh` to point the data directories at the drive.

### Changed

- The passthrough to the modules (`/svc/...`: map tiles, Library pages) is
  read only: changes go through the API, where your login and role are
  checked.
- Starting and stopping modules, blocking devices,
  deleting shared files, Board posts and supplies, and pinning posts are
  for admins now, instead of asking for a control PIN.
- The installer asks much less. A first install asks which modules, one
  folder for all data (for example on the SSD) and what a module can't do
  without. Port, access and a folder per module are asked
  only with `./install.sh --advanced`.
  Re-running it with a new data folder moves all data there.
- `./update.sh` now downloads the new images instead of rebuilding them
  and keeps every installer answer. `--clean` builds them locally from
  scratch.
- `./start.sh` downloads the images of the installed version when they are
  missing and removes images of older versions to free the disk.
  `--build` builds them locally instead; `--pull` is gone.
- Core's restart policy is now `on-failure` like the modules' (a crash is
  still restarted), and `install.sh` no longer enables
  `podman-restart.service`: outpost starts at boot through its own unit
  (see Added). `podman-restart.service` is left enabled on existing
  installs, since other containers may use it; disable it with
  `systemctl --user disable podman-restart.service` if nothing else needs
  it.
- The menu is split in two: your apps (Maps, Library, ...) at the top,
  the screens of outpost itself (System, Logs, Info, Settings,
  Diagnostics) at the bottom. On a phone the bottom bar shows a line
  between the two groups.
- System: the Power events card shows the latest 5 events; ALL in its
  header opens a window with every recorded event.
- The status strip is now exactly the same on every screen: the link to
  the Pi (`CORE · LIVE`), its vitals and the UTC time. What used to be
  screen-specific moved onto the screen: GNSS accuracy into the Maps
  context line, error and warning counts into the Logs context line; the
  region count, download and sync progress were already shown there.
- Module numbers in the headers follow the new list: Maps 01, Library 02,
  Network 03, Files 04, Board 05, Supplies 06, System 07, Logs 08, Info
  09, Settings 10, Diagnostics 11.

### Fixed

- Maps: the setup failed with `ENOTEMPTY: directory not empty, rmdir
  '.../assets/fonts/Noto Sans Regular'` when the map assets live on a
  damaged exFAT drive (after a power cut). The setup now puts the new
  fonts and sprites in place without deleting the old ones first and only
  leaves an undeletable old copy behind (`fonts.old-*`). A failed setup no
  longer always blames the internet connection: drive errors point to
  Diagnostics.
- Maps: downloading a large region no longer fails with `stream error:
  ... PROTOCOL_ERROR`. The download now uses HTTP/1.1 and starts over by
  itself (up to 3 tries) when the connection to the map server drops.
- `./update.sh` and `./start.sh --pull` failed with podman-compose
  (`argument --pull: invalid choice: 'core'`).
- `./update.sh` and `./start.sh --pull` failed with podman-compose 1.3
  (Raspberry Pi OS) with `argument --pull: ignored explicit argument
  'always'`. The build now uses the pull option the installed compose
  understands.

### Removed

- The `CONTROL_PIN` setting: the admin role replaces it. It is ignored if
  it is still in your `.env`.
- Mesh: the Meshtastic messaging module, its screen and the nodes layer
  of Maps are gone, together with the old Mesh map module and the `MESH_*`
  settings. On an existing install, remove the old container and images
  with `podman rm -f outpost-mesh; podman rmi $(podman images -q '*outpost-mesh*')`;
  your old message history stays in `MESH_DATA_DIR` (`data/mesh` by
  default) until you delete it yourself.

### Changed

- Hotspot fallback: the hotspot is called `Basecamp-1` by default (new
  installs, or an empty `HOTSPOT_SSID`). An existing
  `/etc/hotspot-fallback.env` keeps its name; change `HOTSPOT_SSID` there
  to switch.

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
