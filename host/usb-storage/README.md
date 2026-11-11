# usb-storage

Host-level helper (no container) for a Raspberry Pi: mounts a USB stick or
SSD at every boot and whenever it is plugged in, so outpost's growing data
(maps, library) can live on it instead of the SD card.

```sh
sudo ./install-usb-storage.sh [--device /dev/sda1] [--mount /media/Data] [--user pi] [--yes]
sudo ./uninstall-usb-storage.sh [--yes]
```

What the installer writes:

| Where | What |
|---|---|
| `/etc/fstab` | One entry by UUID, below the line `# outpost-usb-storage ...`, with `nofail`, `x-systemd.before=local-fs.target` and a 10 s device timeout. exFAT, FAT32 and NTFS get `uid`/`gid` of the user and `umask=0022`. |
| `/etc/fstab` | Other active entries for the same mount point, commented out with `#outpost-usb-storage-disabled# `. |
| `/etc/fstab.outpost-usb.<time>.bak` | A backup before every change. |
| `/etc/udev/rules.d/99-outpost-usb-storage.rules` | `SYSTEMD_WANTS=<mount unit>` for the drive's UUID: systemd mounts it when it appears. |
| `<mount point>/outpost` | The folder for the data directories, owned by the user. |

The uninstaller removes the entry and the rule and restores the
commented-out entries. It leaves the drive and its data alone.

Then point the data at it with `./install.sh` (step 4). User docs:
[Storage](../../docs/02-installation/02-storage.md).
