# Uninstall

`uninstall.sh` removes outpost from the Pi. It always removes the
containers and images. Your data is kept unless you confirm deleting it.

```sh
./uninstall.sh            # asks before deleting anything
./uninstall.sh --purge    # also deletes every data directory and .env
```

| Option | Effect |
|---|---|
| `--purge` | Deletes the data directories and `.env` too (asks once, unless `--yes`). |
| `--yes` | Asks nothing. Without `--purge`, the data is kept. |
| `--help` | Prints the usage. |

It works with or without `.env` and even when Podman is already gone.

## What happens

1. It lists what it will do: the containers and images it removes, and for
   each data directory whether it is kept or deleted.
2. It asks once whether to uninstall (default no).
3. It stops and removes every container (`compose down`, plus any
   `outpost-*` container left over, for example of a module you removed
   from `MODULES`).
4. It removes the images (`outpost-core`, `outpost-maps`,
   `outpost-knowledge`, `outpost-mesh`, `outpost-mesh-map` and the
   Kiwix base image).
5. For each data directory, it shows the path and size and asks whether to
   delete it (default no). With `--purge` it deletes without asking each
   one.
6. It removes `.env` only when every data directory was deleted. As long as
   any data is kept, `.env` stays, so a later `./install.sh` finds the data
   again.

The data directories it knows are `CORE_DATA_DIR`, `MAPS_DATA_DIR`,
`MAPS_ASSETS_DIR`, `KNOWLEDGE_CONTENT_DIR` and `MESH_DATA_DIR`, read from
`.env` (or their defaults under `data/`).

## Safety rules

- A directory that does not exist is treated as "drive not mounted", not as
  "no data". It is left alone, and `.env` is kept.
- It never deletes a directory that contains the project folder, nor `/`,
  your home directory, `/home`, `/media`, `/mnt`, `/srv`, `/var`, `/usr` or
  `/etc`. It tells you to remove such a directory yourself.

## What it leaves alone

- The project folder (the Git clone). Delete it yourself when you no longer
  need it.
- Podman itself.
- `podman-restart.service` and lingering for your user (other containers
  may rely on them).
- `podman.socket`. To stop it:
  `systemctl --user disable --now podman.socket`.
- The Wi-Fi hotspot fallback. It has its own uninstaller, see
  [Network and hotspot](../02-installation/03-network-and-hotspot.md#uninstall).

Leftover build layers can take a lot of space. Clean them up with:

```sh
podman image prune
```

## Installing again

Run `./install.sh`. If you kept the data and `.env`, it uses the same
locations and nothing has to be downloaded again.

## See also

- [Backup and restore](03-backup-and-restore.md)
- [Storage and SSD](../02-installation/02-storage.md)
