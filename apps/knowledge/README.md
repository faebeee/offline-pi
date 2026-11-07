# Offline Knowledge (Kiwix Box)

Self-contained, interactive installer for an offline emergency-knowledge box
built on [Kiwix](https://www.kiwix.org/): a curated subset of the Kiwix
library covering medical/first aid, food & water, shelter & repair, and
general survival/prepping — the kind of information that's useful to have on
hand *without* internet access, on any Linux machine, including a Raspberry Pi
with an attached SSD.

- Picks from a **curated emergency-knowledge subset** of the Kiwix catalog by
  default (medical, food & water, shelter/repair, general survival) via an
  interactive checkbox menu — or browse the full catalog with `--all` if you
  want something outside that list
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
  select. Most curated topics are tens to hundreds of MB; a few (WikiMed with
  images, `ifixit`, `ready.gov`) run into the GB range, and
  `survivorlibrary.com` alone is roughly **220 GB** — the installer checks
  free space before downloading, but plan storage accordingly if you want it.

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
4. Ask whether to show the curated emergency subset (default) or the full
   catalog, then let you filter by language and pick topics in a checkbox
   menu (shows size per item, grouped as `[Medical]`, `[Food & Water]`,
   `[Shelter & Repair]`, `[General Survival]`, `[General Reference]`).
5. Check available disk space before downloading.
6. Download selected ZIM files with resume + checksum verification.
7. Start `kiwix-serve` via Podman Compose (`restart: always`; `install.sh` enables `podman-restart.service` so it comes back after a reboot).

Once done, access your content at `http://<pi-ip>:8081` from any device on
your network.

Already configured and just need to (re)start the container (e.g. after a
reboot or a manual stop)? Run `./start.sh` — it reuses the existing `.env`
instead of asking any setup questions.

## Curated emergency knowledge

By default, the topic picker only shows a maintained subset of the Kiwix
catalog relevant to survival/emergency scenarios (see `lib/emergency.sh`):

| Group | Topics |
|---|---|
| **Medical** | WikiMed Medical Encyclopedia, Military Medicine field manuals, NHS Medicines A–Z, MedlinePlus, CDC Travelers' Health |
| **Food & Water** | FOSS Cooking, Public Domain Recipes, based.cooking |
| **Shelter & Repair** | iFixit, Low‑Tech Magazine (solar-powered), Hundred Rabbits (off-grid living), CD3WD Project (sustainable-development reference) |
| **General Survival** | Survivor Library (⚠️ ~220 GB on its own), True Prepper, Ready.gov, Rabbit Waves |
| **General Reference** | Wikipedia in Simple English (fallback general knowledge) |

This list is deliberately small and hand-picked rather than full-text
searched — the Kiwix catalog's search API doesn't support reliable
keyword/tag search, so curation is maintained as a plain name list in
`lib/emergency.sh` and can be extended there.

Need something outside this list? Both entry points support an explicit
opt-out to browse the entire Kiwix catalog instead:

```bash
./install.sh --all          # first run: browse the full catalog
./manage.sh add --all       # later: browse the full catalog
```

(`install.sh` without `--all` also asks interactively whether to use the
curated subset or the full catalog.)

## Managing content later

```bash
./manage.sh list       # show installed topics and sizes
./manage.sh add         # pick and download more topics (curated subset)
./manage.sh add --all    # ...or browse the full Kiwix catalog instead
./manage.sh update      # check for newer versions of installed topics
./manage.sh remove      # pick installed ZIM files to delete
./manage.sh status      # container status + disk usage
```

`update` downloads newer versions alongside the old ones (never silently
deletes data); review with `list` and clean up old files with `remove` once
you're happy. `update` always checks against the full catalog, regardless of
how a topic was originally installed, so anything added via `--all` still
gets update checks.

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
  emergency.sh            Curated list of emergency-relevant ZIM names
  ui.sh                   gum-based checkbox selector
  diskcheck.sh            Free space checks
  download.sh             aria2c-based resumable/verified downloads
docker-compose.yml        kiwix-serve service definition
.env.example              Template configuration
```
