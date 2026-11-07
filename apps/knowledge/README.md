# Offline Knowledge (Kiwix Box)

Offline emergency-knowledge box built on [Kiwix](https://www.kiwix.org/):
a fixed set of ZIM files (medical/first aid, food & water, shelter & repair,
general survival, reference) that's useful to have *without* internet
access, served over your LAN from any Linux machine, including a Raspberry
Pi with an attached SSD.

- The ZIM set is defined once in [`zims.txt`](zims.txt); there is no
  interactive selection
- Everything runs inside the container: catalog lookup, resumable and
  checksum-verified downloads (`aria2c` + Kiwix `.meta4` metalinks) and
  `kiwix-serve`. The host only needs Podman
- Content is served immediately; each ZIM appears in the library as soon as
  its download completes
- Configurable storage location (point it at your SSD)
- Auto-starts on boot, survives reboots; works fully offline once downloaded

## Requirements

- A Debian-based Linux system (Raspberry Pi OS, Ubuntu, Debian) with
  `podman` and `podman compose`/`podman-compose` (the installer offers to
  install them via `apt`).
- Internet access while the ZIMs download.
- Enough free disk space for `zims.txt`: the default set is roughly
  **13 GB**. The container checks free space before each download and skips
  a ZIM that doesn't fit.

## Quick start

```bash
git clone <this-repo> offline-pi
cd offline-pi/apps/knowledge
# optional: edit zims.txt first
./install.sh
```

The installer will:

1. Check/install Podman and a compose backend.
2. Ask for port and bind address (first run only) and write `.env`.
3. Ask where to store content (every run, e.g. `/mnt/ssd/kiwix`; see
   "Moving storage" below).
4. Build the image (`ghcr.io/kiwix/kiwix-serve` plus `aria2`, `curl`,
   `xmlstarlet` and `zims.txt`) and enable `podman-restart.service` +
   lingering so the container comes back after a reboot.
5. Start the container via `./start.sh`.

On start the container serves whatever is already installed and downloads
every entry of `zims.txt` that's missing in the background. Follow progress
with `./manage.sh logs`, then open `http://<pi-ip>:8082`.

`./start.sh` rebuilds and restarts the container from the existing `.env`
without asking anything (e.g. after editing `zims.txt` or a `git pull`).

## Defining the ZIM set (`zims.txt`)

One entry per line: the ZIM file name without date suffix and `.zim`, as
listed on <https://download.kiwix.org/zim/>. Pick the flavour explicitly
(`_maxi` with images, `_nopic`, `_mini`):

```
wikipedia_en_medicine_maxi     # wikipedia_en_medicine_maxi_2026-10.zim
ifixit_en_all                  # ifixit_en_all_2025-12.zim
```

`#` starts a comment. The default list covers WikiMed, military medicine,
NHS Medicines, MedlinePlus, CDC Travelers' Health, three cookbooks, iFixit,
Low-Tech Magazine, Hundred Rabbits, CD3WD, True Prepper, Ready.gov, Rabbit
Waves and Simple English Wikipedia. Survivor Library (~210 GB) is listed but
commented out.

The file is baked into the image. After editing it, run `./start.sh` (it
rebuilds and recreates the container, which then downloads the new
entries). Entries the Kiwix catalog doesn't know are reported in the log.
Removing a line doesn't delete anything; `./manage.sh prune` does.

## Managing content later

```bash
./manage.sh list      # installed ZIMs, which are served, which are missing
./manage.sh sync      # download missing entries of zims.txt now
./manage.sh update    # download newer versions of the entries in zims.txt
./manage.sh prune     # delete old versions + ZIMs no longer in zims.txt (asks)
./manage.sh logs      # follow the container log (download progress)
./manage.sh status    # container status + disk usage
```

All of these run inside the container (`podman exec`), so the container has
to be running. `update` downloads new versions alongside the old ones; the
library switches to the newest file per entry right away, and the old file
stays on disk until you run `prune`. Only one sync/prune runs at a time.

## Configuration (`.env`)

| Variable        | Description                                                        | Default  |
|-----------------|--------------------------------------------------------------------|----------|
| `CONTENT_DIR`   | ZIM files, partial downloads, catalog cache, `library.xml`. Point at your SSD. | `./data` |
| `KIWIX_PORT`    | Host port for kiwix-serve (container port 8080).                   | `8082`   |
| `BIND_ADDRESS`  | `all` / `ipv4` / `ipv6`: address family kiwix-serve listens on.    | `all`    |
| `AUTO_SYNC`     | `true`: download missing `zims.txt` entries on every start. `false`: only on `./manage.sh sync`. | `true` |

Default ports are chosen to avoid colliding with other `offline-pi` apps
(`monitor` uses `8080`, `maps` `8081`).

### Moving storage

Re-run `./install.sh` and enter the new path (e.g. a newly mounted SSD). If
the old location has content, it offers to copy it over, then removes the
old copy and updates `.env`; if the copy fails, both copies and `.env` stay
as they are.

## Uninstall

```sh
./uninstall.sh            # asks before deleting anything
./uninstall.sh --purge    # also deletes CONTENT_DIR (all ZIM files) and .env
```

Always removes the container, the locally built `offline-knowledge` image
and the `kiwix-serve` base image. Your ZIM library in `CONTENT_DIR` is kept
unless you confirm deleting it (or pass `--purge`), and `.env` stays as long
as the library does, so a later `./install.sh` picks it up again. Podman,
`podman-restart.service` and lingering are left alone.

## How it works

- The container entrypoint (`container/knowledge.sh serve`) builds
  `$CONTENT_DIR/library.xml` from the newest file of each entry in
  `$CONTENT_DIR/zim`, starts the sync in the background and runs
  `kiwix-serve --library --monitorLibrary`, so new downloads show up without
  a restart.
- The sync reads the official Kiwix OPDS catalog
  (`https://library.kiwix.org/catalog/v2/entries`, cached for a day in
  `$CONTENT_DIR/.cache`) only when something is missing or an update was
  requested. Without internet it logs a warning and keeps serving.
- Each entry's `.meta4` metalink carries mirrors and checksums; `aria2c`
  downloads into `$CONTENT_DIR/.partial` (resumable across restarts) and the
  file only moves into `zim/` once verified.

## Project layout

```
zims.txt                  The ZIM set to download and serve
Dockerfile                kiwix-serve + aria2/curl/xmlstarlet + zims.txt
container/knowledge.sh    In-container tool: serve / sync / prune / list / library
docker-compose.yml        Service definition
install.sh                First-run setup (ends by calling start.sh)
start.sh                  Rebuild + (re)start from an existing .env
manage.sh                 list / sync / update / prune / logs / status
uninstall.sh              Remove container/images; ZIM files only on confirmation
lib/deps.sh               Podman detection/installation, log + compose helpers
.env.example              Template configuration
```
