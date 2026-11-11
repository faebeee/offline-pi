# Settings

Settings shows every setting of the Pi in one place: what is in `.env`,
what each value means, and where the data lives and how big it is. It is
module 08, served by core: it has no container of its own and is always
on. Open it with Settings in the module nav (`/settings`).

The screen is read only. `.env` is written by `./install.sh` alone; to
change a setting, run `./install.sh` in the project folder on the Pi (see
[Settings reference](../05-reference/01-settings.md)).

## Data folders

One row per data directory (`CORE_DATA_DIR`, `MAPS_DATA_DIR`,
`KNOWLEDGE_CONTENT_DIR`, ...):

| Shown | Meaning |
|---|---|
| Name and size | The variable and how much its folder takes on disk (like `du`). Measuring a big library can take a few seconds; the result is kept for 5 minutes. `≥` means the count stopped early (very many files) and the real size is bigger |
| Path | The folder on the Pi, as an absolute path |
| Bar and line below | The drive the folder is on: used space, free of total, device (for example `/dev/sda1`), file system and mount point. Amber from 90 % full, red from 95 % |
| `MISSING` | The folder does not exist: the drive is not plugged in or not mounted, or the module never started. See [Storage](../02-installation/02-storage.md) |
| `NOT INSTALLED` | The module is not in `MODULES`; its folder is not used |

## All settings

Below the folders, the settings grouped like `.env.example`: Core, Maps,
Library, Mesh, and Other for variables that are in `.env` but not
documented. Each shows its value and the comment from `.env.example`.

- `CHANGED` marks a value that differs from the default; the default is
  shown below it.
- PINs, passwords, tokens and database URLs are never shown, only whether
  they are set.
- Find a setting searches names, values and descriptions; CHANGED shows
  only what differs from the defaults.

The context line shows the project folder and the version.

## Where the values come from

Core reads `.env` from the project folder through its read-only view of
the Pi's file system (`start.sh` tells it where the folder is). If it
can't, the banner says so and the screen shows the values core was started
with instead.
