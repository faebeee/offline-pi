# Diagnostics: troubleshooting checks

The Diagnostics module (`/diagnostics`, number 09) runs a set of checks on
request and shows, per part of outpost, whether it works and what to do
when not. User guide: [docs/03-modules/09-diagnostics.md](../../docs/03-modules/09-diagnostics.md).

It has **no container of its own**: like System, Logs, Info and Settings
it is served by core (`"service": "core"`, always on). Its domain lives in
`apps/core/src/domains/diagnostics/`, its screen in
`apps/web/src/features/diagnostics/`.

## Checks

| Group | Check | Source |
|---|---|---|
| Setup | `.env` readable, Podman socket answers (`_ping`), container list readable, control PIN, clock | `OUTPOST_DIR`, `PodmanService`, `RuntimeService`, `/run/systemd/timesync/synchronized` |
| Modules | Per module: installed, configured (`requires`), container exists, switched on, running, healthy, answers its `health` endpoint (4 s); the Mesh radio's device exists | `ModulesService`, `UpstreamService`, `/hostfs/dev` |
| Storage | The drive set up by `host/usb-storage` is mounted; per installed `*_DIR`: exists, on its drive (a path under `/media/<x>` or `/mnt/<x>` with nothing mounted there is on the SD card), not read-only, writable for the containers' user (the folder and its direct children); free space once per drive, the system disk always | `SettingsService`, `/proc/1/mounts`, `/hostfs/etc/fstab`, `stat` |
| Host | CPU temperature, under-voltage and throttling (now and since boot), memory, uptime, internet | `CollectorService`, `InternetService` |

Statuses: `ok`, `info` (worth knowing, no action needed), `warn` (will
cause trouble), `fail` (broken now). Free space: `fail` below 1 GB or 2 %,
`warn` below 3 GB or 5 %.

## Folder permissions

The containers all write as the Pi user that runs Podman (keep-id for maps
and knowledge, root in the container for mesh and core). That user comes
from `PODMAN_SOCKET` (`/run/user/<uid>/...`), else the owner of the project
folder; its groups from `/hostfs/etc/passwd` and `/etc/group`. Core itself
runs in rootless Podman's user namespace, so the owners it sees through
`/hostfs` are translated back with `/proc/self/uid_map` and `gid_map`; ids
outside the namespace (root on the Pi) count as "someone else".

Nothing here repairs anything: the fixes are commands for the Pi's terminal.

## Development

`npm run dev:core` runs core from the checkout without a user namespace, so
owners are the Mac's or Linux host's own ids. Without Podman the setup and
module checks fail, which is expected.
