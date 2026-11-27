# Files

Files is a shared folder on the Pi. Anyone on its network or hotspot can
upload photos, documents or scans and open or download them again, with no
internet and no account. Open it with Files in the module nav (`/files`).

Typical uses: photos of damage for the insurance, scans of passports and
prescriptions, a PDF of the local emergency plan, maps or manuals to pass
from one phone to another.

## The screen

The context line shows how many files there are, their total size and the
free space on the disk, for example `42 FILES · 3.1 GB · 118 GB FREE`.

At the top is the folder you are in (`SHARED › Photos › 2026`); tap a part
of it to go back up. The list shows folders first, then files, by name.
Each row has the name, the size (folders: how many items) and when it last
changed. Tap a folder to open it, tap a file to open it in a new tab.

Each row has three buttons:

| Button | What it does |
|---|---|
| Download | Saves the file on your device. |
| Rename | Gives the file or folder a new name. |
| Delete | Deletes the file, or the folder with everything in it, after a question. Asks for the control PIN when one is set. |

Pictures, videos, audio, PDFs and plain text open in the browser. Every
other file is downloaded. Web pages (HTML) and SVG images are always
downloaded and never shown inside outpost, because anyone could have
uploaded them.

## Uploading

Press UPLOAD and choose one or more files, or drop files anywhere on the
screen (on a computer). They go into the folder you are in. A card shows
each upload with a progress bar; you can cancel one while it runs.

- If a file with the same name is already there, the upload stops with
  `EXISTS`. Press REPLACE IT to overwrite it, or rename one of the two.
- A file larger than `FILES_MAX_UPLOAD_MB` (4 GB by default) is refused.
- An upload is also refused when it would leave less than
  `FILES_MIN_FREE_MB` (1 GB by default) free on the disk, so the Pi never
  runs out of space. Free some space or move `FILES_DATA_DIR` to a larger
  drive.
- Keep the page open until the upload is done. An upload that was cut off
  leaves nothing behind.

Press FOLDER to make a new folder in the one you are in.

## Who can do what

There are no accounts. Everyone who can open outpost can upload, rename
and download. Deleting asks for the control PIN when `CONTROL_PIN` is set
(see [Home](01-home.md#the-control-pin)). If outpost is reachable by people
you don't know, for example on an open hotspot, set a control PIN and use
[Network](10-network.md) to block devices that misbehave.

## Where the files are

The files are plain files and folders in `FILES_DATA_DIR` on the Pi
(`./data/files` by default). You can copy them off the Pi as they are, or
put files there yourself: they appear on the screen right away. Names that
start with a dot are hidden.

The shared folder grows with every upload. Point `FILES_DATA_DIR` at an SSD
(see [Storage](../02-installation/02-storage.md)) and back it up if the files
matter: they exist only on this Pi (see
[Backup and restore](../04-operations/03-backup-and-restore.md)).
