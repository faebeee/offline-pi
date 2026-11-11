# Settings: the configuration, read only

The Settings module (`/settings`, number 08) shows every `.env` variable
with its comment and default from `.env.example`, and every `*_DIR` with its
path on the Pi, its drive (device, file system, mount point, free space)
and its disk usage. User guide: [docs/03-modules/08-settings.md](../../docs/03-modules/08-settings.md).

It has **no container of its own**: like System, Logs and Info it is served
by core (`"service": "core"`, always on). Its domain lives in
`apps/core/src/domains/settings/`, its screen in
`apps/web/src/features/settings/`.

## How it reads the configuration

- `lib/common.sh` exports `OUTPOST_DIR` (the project folder) before every
  compose call; `compose.yml` passes it to core.
- Core reads `$OUTPOST_DIR/.env` and `.env.example` through `/hostfs`
  (the read-only host mount). Without it (no `OUTPOST_DIR`, unreadable
  file) it falls back to its environment and the `.env.example` in its
  image.
- Relative `*_DIR`s resolve against `OUTPOST_DIR`. The drive comes from
  the host's mount table (`/proc/1/mounts`, core runs with `pid: host`).
- Sizes (`GET /api/settings/sizes`) walk each folder once (allocated
  blocks, symlinks not followed, at most 20 s or 500 000 entries per
  folder), one folder at a time, and are cached for 5 minutes.
- Variables whose name ends in `PIN`, `PASSWORD`, `SECRET`, `TOKEN`,
  `API_KEY`, `PRIVATE_KEY` or `DATABASE_URL` are sent only as set or not set.

Nothing here writes `.env`: only `install.sh` does (AGENTS.md).

## Development

In development (`npm run dev:core`) core runs from the checkout, so it reads
the checkout's `.env`. Point `OUTPOST_DIR` at another folder to try other
values.
