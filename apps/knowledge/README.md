# Offline Knowledge (Kiwix Box)

Self-contained, interactive installer for running [Kiwix](https://www.kiwix.org/)
offline content (Wikipedia, Wiktionary, StackExchange, TED, Project Gutenberg,
maps, and more) on any Linux machine — including a Raspberry Pi with an
attached SSD.

- Pick topics from the **live Kiwix catalog** via an interactive checkbox menu
- Resumable, checksum-verified downloads (via `aria2c` + Kiwix's `.meta4` metalinks)
- Content served locally over your LAN via `kiwix-serve` in Podman
- Configurable storage location (point it at your SSD)
- Auto-starts on boot, survives reboots
- `manage.sh` for adding/updating/removing topics and checking status later

## Requirements

- A Debian-based Linux system (Raspberry Pi OS, Ubuntu, Debian). The installer
  will offer to install missing dependencies (`podman`, `podman-compose`,
  `aria2`, `xmlstarlet`, `gum`) via `apt` where possible.
- Enough free disk space at your chosen storage location for the content you
  select (Wikipedia-with-media sets can be tens of GB; text-only/`nopic`
  editions are much smaller).

## Quick start

```bash
git clone <this-repo> offline-knowledge
cd offline-knowledge
./install.sh
```

The installer will:

1. Check/install dependencies (Podman, aria2c, xmlstarlet, gum).
2. Ask where to store content (e.g. `/mnt/ssd/kiwix`) and write a `.env` file.
3. Fetch the current Kiwix catalog.
4. Let you filter by language and pick topics in a checkbox menu (shows size
   per item).
5. Check available disk space before downloading.
6. Download selected ZIM files with resume + checksum verification.
7. Start `kiwix-serve` via Podman Compose (`restart: unless-stopped`).

Once done, access your content at `http://<pi-ip>:8081` from any device on
your network.

Already configured and just need to (re)start the container (e.g. after a
reboot or a manual stop)? Run `./start.sh` — it reuses the existing `.env`
instead of asking any setup questions.

## Managing content later

```bash
./manage.sh list     # show installed topics and sizes
./manage.sh add       # pick and download more topics
./manage.sh update    # check for newer versions of installed topics
./manage.sh remove    # pick installed ZIM files to delete
./manage.sh status    # container status + disk usage
```

`update` downloads newer versions alongside the old ones (never silently
deletes data); review with `list` and clean up old files with `remove` once
you're happy.

## Configuration (`.env`)

| Variable        | Description                                         | Default   |
|-----------------|------------------------------------------------------|-----------|
| `CONTENT_DIR`   | Where ZIM files and cache live. Point at your SSD.   | `./data`  |
| `KIWIX_PORT`    | Host port for kiwix-serve.                           | `8081`    |
| `BIND_ADDRESS`  | `all` / `ipv4` / `ipv6` / specific IP for the server.| `all`     |

Default ports are chosen to avoid colliding with other `offline-pi` apps
running on the same host (e.g. `maps` defaults to `8080`). If you change
`KIWIX_PORT`, make sure it doesn't clash with another app's port.

To move your library to a new disk: stop the service
(`podman compose down`), move the `CONTENT_DIR` directory, update `.env`,
then `podman compose up -d` (or just re-run `./install.sh`, which detects the
existing `.env`).

## How it works

- Content is fetched from the official Kiwix OPDS v2 catalog
  (`https://library.kiwix.org/catalog/v2/entries`).
- Each entry's `.meta4` (metalink) file includes mirror URLs and SHA-256/SHA-1
  checksums; `aria2c` consumes this natively for resumable, verified,
  multi-mirror downloads.
- `kiwix-serve` is pointed directly at `$CONTENT_DIR/zim/*.zim` — no separate
  library.xml bookkeeping is required; adding/removing ZIM files just needs a
  container restart (handled automatically by `manage.sh`).

## Project layout

```
install.sh              Interactive first-run installer (ends by calling start.sh)
start.sh                 Start/restart kiwix-serve from an existing .env
manage.sh                list / add / update / remove / status commands
lib/
  deps.sh                Dependency detection & installation
  catalog.sh              Kiwix catalog fetch & parse helpers
  ui.sh                   gum-based checkbox selector
  diskcheck.sh            Free space checks
  download.sh             aria2c-based resumable/verified downloads
docker-compose.yml        kiwix-serve service definition
.env.example              Template configuration
```
