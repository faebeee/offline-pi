# Storage and SSD

Every module keeps its data in a directory on the host, set in `.env` as a
`*_DIR` variable. Each one defaults to a folder under `data/` in the project
folder (on the SD card). Any of them can point somewhere else, for example
an SSD mounted at `/mnt/ssd`.

## The data directories

| Variable | Default | What is in it | Size |
|---|---|---|---|
| `CORE_DATA_DIR` | `./data/core` | Dashboard history and power events (`history.json`), modules switched off (`modules.json`) | under 1 MB |
| `MAPS_DATA_DIR` | `./data/maps` | Map regions (`regions/*.pmtiles`, `regions.json`), your points of interest (`offline-maps.db`), the region catalog | many GB possible |
| `MAPS_ASSETS_DIR` | `./data/maps-assets` | Map fonts and sprites | about 100 MB |
| `KNOWLEDGE_CONTENT_DIR` | `./data/knowledge` | Library books (ZIM files in `zim/`), partial downloads, your book selection (`selection.txt`) | MB to hundreds of GB |
| `MESH_DATA_DIR` | `./data/mesh` | Message history and node list (`mesh.db`) | small |

The two that grow are `MAPS_DATA_DIR` and `KNOWLEDGE_CONTENT_DIR`. Put those
on an SSD if you plan to download large regions or many books. The others
are fine on the SD card.

## Choosing or changing a location

Do not edit the `*_DIR` lines in `.env` by hand. Re-run `./install.sh`
instead. In step 4 it asks for every directory again, with the current
location as the default. For each answer it:

1. turns the path into an absolute path,
2. creates the directory if needed and checks that it is writable (if not,
   it asks again; with `--yes` it stops with an error),
3. shows how much space is free there.

When the answer differs from the current location and the old directory
has content, it treats that as "move my data there":

1. It asks for confirmation and shows the size.
2. It copies the data (with `rsync`, or `cp -r` if `rsync` is missing).
3. It deletes the old copy.
4. It writes the new path to `.env`.

If the copy fails, both copies are kept and `.env` is left unchanged. Fix
the problem and run `./install.sh` again. If you decline the move, `.env`
points at the new, empty directory and your data stays at the old location
until you move it yourself.

Example answers for an SSD mounted at `/mnt/ssd`:

```ini
MAPS_DATA_DIR=/mnt/ssd/outpost/maps
KNOWLEDGE_CONTENT_DIR=/mnt/ssd/outpost/knowledge
```

## Mount the SSD permanently

outpost does not mount drives. Mount the SSD the way your system does it
(for example with an `/etc/fstab` entry by UUID) so that it is there at
every boot, before outpost starts. Use a subfolder of the mount point as
the data directory, not the mount point itself (see the next section).

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
