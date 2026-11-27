# Storage and SSD

Every module keeps its data in a directory on the host, set in `.env` as a
`*_DIR` variable. Each one defaults to a folder under `data/` in the project
folder (on the SD card). Any of them can point somewhere else, for example
an SSD mounted at `/mnt/ssd`.

## The data directories

| Variable | Default | What is in it | Size |
|---|---|---|---|
| `CORE_DATA_DIR` | `./data/core` | Dashboard history and power events (`history.json`), modules switched off (`modules.json`), Board posts (`board.json`), the Supplies list (`supplies.json`) | about 1 MB |
| `MAPS_DATA_DIR` | `./data/maps` | Map regions (`regions/*.pmtiles`, `regions.json`), unfinished downloads (`downloads/`), your points of interest (`offline-maps.db`), the region catalog | many GB possible |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Map fonts and sprites | about 100 MB |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | Library books (ZIM files in `zim/`), partial downloads, your book selection (`selection.txt`) | MB to hundreds of GB |
| `MESH_DATA_DIR` | `./data/mesh` | Message history and node list (`mesh.db`) | small |
| `NETWORK_DATA_DIR` | `./data/network` | Hotspot block list and the devices seen | a few KB |
| `FILES_DATA_DIR` | `./data/files` | The shared files, as plain files and folders | grows with every upload |

The ones that grow are `MAPS_DATA_DIR`, `KNOWLEDGE_CONTENT_DIR` and
`FILES_DATA_DIR`. Put the data folder on an SSD if you plan to download
large regions or many books, or to share many files.

## Choosing or changing a location

All data lives in one folder, `OUTPOST_DATA_DIR` (`./data` in the project
folder by default), with one subfolder per directory above: `core`,
`files`, `maps`, `maps-assets`, `knowledge`, `mesh`, `network`.

Do not edit the `*_DIR` lines in `.env` by hand. Re-run `./install.sh`
instead. It asks "Where should outpost keep its data?" with the current
folder as the default. For the answer it:

1. turns the path into an absolute path,
2. creates the folder if needed and checks that it is writable (if not,
   it asks again; with `--yes` it stops with an error),
3. shows how much space is free there.

When the answer is a new folder, it moves every data directory there:

1. It asks for confirmation for each one that has content and shows the
   size.
2. It copies the data (with `rsync`, or `cp -r` if `rsync` is missing).
3. It deletes the old copy.
4. It writes the new paths to `.env`.

If a copy fails, both copies are kept and `.env` is left unchanged. Fix
the problem and run `./install.sh` again. If you decline a move, that
directory's data stays at the old location until you move it yourself.

For an SSD mounted at `/mnt/ssd`, answer `/mnt/ssd/outpost`. `.env` then
holds:

```ini
OUTPOST_DATA_DIR=/mnt/ssd/outpost
MAPS_DATA_DIR=/mnt/ssd/outpost/maps
KNOWLEDGE_CONTENT_DIR=/mnt/ssd/outpost/knowledge
FILES_DATA_DIR=/mnt/ssd/outpost/files
```

### One folder per directory

To keep, say, the books on the SSD but everything else on the SD card, run
`./install.sh --advanced`: it asks for every directory on its own, with the
same checks and moves. A directory set this way is left where it is by
later runs without `--advanced`.

## Mount the drive automatically

outpost itself does not mount drives, but the project folder has a helper
for the Pi: `host/usb-storage` mounts a USB stick or SSD at every boot and
whenever it is plugged in.

```sh
sudo host/usb-storage/install-usb-storage.sh
```

It finds the USB drive (pass `--device /dev/sda1` if there are several),
shows what it will do and asks once. Then it:

1. adds an `/etc/fstab` entry by UUID, mounted at `/media/<label>` (for
   example `/media/Data`; change it with `--mount`). The entry has
   `nofail`, so the Pi still boots without the drive, and it is mounted
   before the containers start,
2. comments out other fstab entries for the same mount point (an old
   drive), keeping a backup of `/etc/fstab` next to it,
3. adds a udev rule that mounts the drive when it is plugged in later,
4. mounts it now and creates an `outpost` folder on it owned by you.

exFAT, FAT32 and NTFS drives are mounted with your user as the owner, so
the containers can write to them. ext4 is mounted as is; the installer
gives you the drive's root folder.

At the end it prints the paths to give `./install.sh` in step 4, for
example:

```ini
MAPS_DATA_DIR=/media/Data/outpost/maps
MAPS_ASSETS_DIR=/media/Data/outpost/maps-assets
KNOWLEDGE_CONTENT_DIR=/media/Data/outpost/knowledge
```

Use a subfolder of the mount point as the data directory, not the mount
point itself (see the next section).

If you plug the drive in while outpost is already running, the maps and
library containers still see the folder as it was when they started. Stop
and start them on the dashboard (or run `./start.sh`).

### Undo the automount

```sh
sudo host/usb-storage/uninstall-usb-storage.sh
```

It removes the fstab entry and the udev rule and restores fstab entries it
had commented out. The drive stays mounted until you unplug it or reboot.
Nothing on the drive is deleted.

## When the drive is not there

`start.sh` checks that every data directory of the installed modules
exists before it starts anything. If one is missing, it stops with:

```
[error] MAPS_DATA_DIR '/mnt/ssd/outpost/maps' is not available (is the drive mounted?). Re-run ./install.sh to pick another.
```

Mount the drive and run `./start.sh` again. This check only sees whether
the directory exists. If you used the mount point itself (for example
`/mnt/ssd`) and the drive is not mounted, the empty mount point still
exists and the module would write to the SD card instead. A subfolder such
as `/mnt/ssd/outpost/maps` avoids that, because it only exists while the
drive is mounted.

`uninstall.sh` also treats a missing directory as "drive not mounted": it
keeps it and keeps `.env`.

## exFAT and other drives without Unix permissions

External SSDs are often formatted as exFAT. exFAT has no Unix owners or
permissions and rejects `chmod` and `chown`. outpost copes with that:

- `install.sh` copies data without permissions, owner and group
  (`rsync -a --no-perms --no-owner --no-group`).
- If you copy data yourself, do the same: use those `rsync` options or
  `cp -r`, not `cp -a`.
- On exFAT the Library screen shows no progress bar for downloads (the
  progress is read from sparse files, which exFAT does not support). The
  downloads themselves work.

A Linux filesystem such as ext4 has none of these limitations.

## Power

An SSD on USB needs enough power. With a too weak power supply it can drop
out under write load, which shows up as failed downloads. See
[Hardware](../01-overview/02-hardware.md#power-supply).

## See also

- [Backup and restore](../04-operations/03-backup-and-restore.md)
- [Settings](../05-reference/01-settings.md)
- [Paths and ports](../05-reference/02-paths-and-ports.md)
