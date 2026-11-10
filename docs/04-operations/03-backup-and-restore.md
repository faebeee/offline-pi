# Backup and restore

outpost has no backup command. A backup is a copy of two things: the
settings file `.env` and the data directories. This page says which data
you cannot get back and how to copy it by hand.

## What to back up

| What | Where | Can you get it back without a backup? |
|---|---|---|
| Settings | `.env` in the project folder | Partly: `install.sh` asks again, but PINs, ports and module settings are lost. Small, always back it up. |
| Mesh message history | `MESH_DATA_DIR` (`mesh.db`) | **No.** Messages exist only on this Pi. |
| Points of interest | `MAPS_DATA_DIR` (`offline-maps.db`) | **No.** Places you saved yourself. |
| Dashboard data | `CORE_DATA_DIR` (`history.json`, `modules.json`) | Not needed: 24 h history, power events and which modules are switched off. Small. |
| Map regions | `MAPS_DATA_DIR` (`regions/`, `regions.json`) | Yes, download them again in Maps (needs internet, can be many GB). |
| Map fonts and sprites | `MAPS_ASSETS_DIR` | Yes, `install.sh` downloads them again. |
| Library books | `KNOWLEDGE_CONTENT_DIR` (`zim/`) | Yes, download them again (needs internet, can be hundreds of GB). |
| Book selection | `KNOWLEDGE_CONTENT_DIR` (`selection.txt`) | Yes, choose the books again on the Library screen. Small. |

The code itself is in Git and does not need a backup.

`./manage.sh mesh export messages.csv` writes all messages as CSV. That is
handy for reading or archiving, but it is not a backup you can restore
from; copy `mesh.db` for that.

Look up the actual locations in `.env`:

```sh
grep '_DIR=' .env
```

## Make a backup

Stop outpost's modules first, so no database is written while you copy
it. The simplest way is to stop the modules with data you care about:

```sh
./manage.sh stop mesh
./manage.sh stop maps
```

Then copy `.env` and the directories to another disk, for example a USB
stick mounted at `/media/backup`:

```sh
mkdir -p /media/backup/outpost
cp .env /media/backup/outpost/
rsync -a --no-perms --no-owner --no-group /path/to/mesh/ /media/backup/outpost/mesh/
rsync -a --no-perms --no-owner --no-group /path/to/maps/ /media/backup/outpost/maps/
```

Replace `/path/to/...` with the paths from `.env`. The `--no-perms
--no-owner --no-group` options make the copy work on exFAT drives too.
`MAPS_DATA_DIR` holds both your points of interest and the map regions, so
the copy can be large. Keeping the regions saves you from downloading them
again, which matters when there is no internet. Copy `CORE_DATA_DIR` and
`KNOWLEDGE_CONTENT_DIR` the same way if you want them.

Switch the modules on again afterwards:

```sh
./manage.sh start maps
./manage.sh start mesh
```

## Restore onto a new SD card

1. Set up the new card with the operating system, as for a first
   installation.
2. Clone the project:

   ```sh
   git clone https://github.com/faebeee/offline-pi.git
   cd outpost
   ```

3. Copy the backed-up `.env` into the project folder.
4. Copy the data directories back. The easiest is to put them where `.env`
   expects them. If the paths are relative (`./data/...`), they are inside
   the project folder; if they point at an SSD that you kept, they may
   already be there.
5. Run `./install.sh`. It finds the existing `.env`, keeps your answers as
   defaults and asks for every data directory again. If you put the data
   somewhere else, give the new location here.
6. `install.sh` builds everything and starts outpost. Maps downloads its
   fonts and sprites during the build if you did not restore
   `MAPS_ASSETS_DIR`.

Some values in `.env` describe the old system (`PODMAN_SOCKET`,
`PODMAN_GRAPH_ROOT`, `VCIO_DEVICE`); `install.sh` detects them again on every
run. For a USB Meshtastic node it asks you to confirm the device, so plug the
node in first.

Which modules were switched off is stored in `CORE_DATA_DIR/modules.json`.
Without it every installed module is switched on.

## See also

- [Storage and SSD](../02-installation/02-storage.md)
- [Install](../02-installation/01-install.md)
- [Uninstall](04-uninstall.md)
