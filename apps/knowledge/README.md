# Offline Knowledge (Kiwix Box)

Offline emergency-knowledge box built on [Kiwix](https://www.kiwix.org/):
a fixed set of ZIM files (medical/first aid, food & water, shelter & repair,
general survival, reference) that's useful to have *without* internet
access, served over your LAN through core at `/library` (module label
"Library").

- The ZIM set is defined once in [`zims.txt`](zims.txt); there is no
  interactive selection
- Everything runs inside the container: catalog lookup, resumable and
  checksum-verified downloads (`aria2c` + Kiwix `.meta4` metalinks) and
  `kiwix-serve`. The host only needs Podman
- Content is served immediately; each ZIM appears in the library as soon as
  its download completes
- Configurable storage location (point it at your SSD)
- Works fully offline once downloaded
- A "Library" screen in the web app (see below) lists books, searches and
  opens articles in an in-app reader; the article pages stay Kiwix's own

## Requirements

- offline-pi installed with the `knowledge` module (root `./install.sh`;
  see the root README for install, start and uninstall).
- Internet access while the ZIMs download.
- Enough free disk space for `zims.txt`: the default set is roughly
  **13 GB**. The container checks free space before each download and skips
  a ZIM that doesn't fit.

On start the container serves whatever is already installed and downloads
every entry of `zims.txt` that's missing in the background. Follow progress
with `./manage.sh logs knowledge`, then open `http://<pi-ip>:8080/library`.

## Library screen

`/library` is the "Library" screen of the single web app (`apps/web`, code
in `apps/web/src/features/library/` and `apps/web/src/routes/library.*.tsx`,
built on the shared Outpost design, see `DESIGN.md` in the repo root): a
full-text search field and the list of installed books with language,
article count and content date. It goes through core's library domain
(`apps/core/src/domains/library/`): `/api/library/books` parses kiwix-serve's
OPDS catalog (`catalog/v2/entries`), so new downloads show up after a
reload, and `/api/library/search` uses kiwix's `search?format=xml`. Articles
open in an in-app reader (`/library/read?url=...`), an iframe of Kiwix's
viewer.

The screen also shows the **background sync**: while books from `zims.txt`
download it shows which book (n of m), how far it is and a `SYNC n/m` strip
item, and the book list refreshes as each one completes; afterwards a badge
says "Up to date", or a banner explains problems or an interrupted sync.
`knowledge.sh` writes the state to `.cache/sync.json` in the content dir at
every step (atomically; an interrupted run is recorded as such, also after a
crash), and core's `/api/library/sync` reads it through its read-only host
mount (kiwix-serve has nowhere to serve it). Download progress comes from the
blocks the partial file uses (aria2c writes it sparse), so it is approximate;
on filesystems without sparse files (exFAT) the screen shows no progress bar.

kiwix-serve runs with `--urlRootLocation /svc/library` (`URL_ROOT` in
`compose.yml`), so its viewer and search pages live under `/svc/library/`,
core's passthrough, which forwards the path without stripping it. Kiwix's
own home page is there too (no custom index).

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
Removing a line doesn't delete anything; `./manage.sh knowledge prune` does.

## Managing content later

```bash
./manage.sh knowledge list     # installed ZIMs, which are served, which are missing
./manage.sh knowledge sync     # download missing entries of zims.txt now
./manage.sh knowledge update   # download newer versions of the entries in zims.txt
./manage.sh knowledge prune    # delete old versions + ZIMs no longer in zims.txt (asks)
./manage.sh logs knowledge     # follow the container log (download progress)
```

All of these run inside the container (`podman exec`), so the module has to
be running (home page switch or `./manage.sh start knowledge`). `update`
downloads new versions alongside the old ones; the library switches to the
newest file per entry right away, and the old file stays on disk until you
run `prune`. Only one sync/prune runs at a time.

## Configuration

Set in the root `.env` (see the root README):

| Variable | Default | Description |
|---|---|---|
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | ZIM files, partial downloads, catalog cache, `library.xml`. Point at your SSD. |
| `KNOWLEDGE_PORT` | `8082` | Internal port kiwix-serve listens on (loopback only, `MODULES_BIND_ADDRESS`), passed through by core at `/svc/library/`. |
| `KNOWLEDGE_AUTO_SYNC` | `true` | `true`: download missing `zims.txt` entries on every start. `false`: only on `./manage.sh knowledge sync`. |

Re-running `./install.sh` re-asks `KNOWLEDGE_CONTENT_DIR` and moves the
library to a new path (e.g. a newly mounted SSD); if the copy fails, both
copies and `.env` stay as they are. `./uninstall.sh` keeps the library
unless you confirm deleting it.

## How it works

- The service `knowledge` in `compose.yml` in the repo root runs as
  container `offline-pi-knowledge` (image `localhost/offline-pi-knowledge`)
  with host networking, so ZIM downloads don't depend on Podman's bridge
  DNS; kiwix-serve binds `127.0.0.1:KNOWLEDGE_PORT`.
- The container entrypoint (`container/knowledge.sh serve`) builds
  `library.xml` in the content directory from the newest file of each entry
  in its `zim/`, starts the sync in the background and runs
  `kiwix-serve --library --monitorLibrary`, so new downloads show up without
  a restart.
- The sync reads the official Kiwix OPDS catalog
  (`https://library.kiwix.org/catalog/v2/entries`, cached for a day in
  `.cache` in the content directory) only when something is missing or an update was
  requested. Without internet it logs a warning and keeps serving.
- Each entry's `.meta4` metalink carries mirrors and checksums; `aria2c`
  downloads into `.partial` (resumable across restarts) and the
  file only moves into `zim/` once verified.

## Project layout

```
zims.txt                  The ZIM set to download and serve
Dockerfile                kiwix-serve + aria2/curl/xmlstarlet + zims.txt
container/knowledge.sh    In-container tool: serve / sync / prune / list / library
module.json               Module manifest (path, port, data dir, health /svc/library/)
```

Setup, start/stop and `manage.sh` commands live in the repo root
(`lib/modules/knowledge.sh`).
