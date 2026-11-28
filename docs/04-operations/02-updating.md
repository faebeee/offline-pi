# Updating

New versions of outpost are **releases** of the Git repository you
cloned: tags like `v0.2.0`. `update.sh` installs the newest one: it moves
the checkout to that release, downloads the new images and recreates every
container. Your data and `.env` are kept. The Pi needs internet access for
the update.

`update.sh` installs releases only, never the newest commit on `main`. A
checkout that is already newer than the newest release (installed from
`main` before) stays as it is until a newer release comes out.

## The update banner

Once a day, while the Pi is online, outpost asks GitHub whether a newer
release exists. When there is one, admins see a banner on Home:

```
ⓘ  outpost 0.2.0 is available
   Installed: 0.1.0. Released 2026-12-03. On the Pi, run ./update.sh.
   [What's new]  [Later]
```

- **What's new** shows the release notes (the version's part of the
  [Changelog](../07-changelog.md)).
- **Later** hides the banner on this browser until the next release.
- A release that needs you to do something shows a caution banner instead;
  read what's new before updating.
- The **Version** card on the [System](../03-modules/05-system.md) screen
  shows the installed version, the newest release and when outpost last
  asked, and has **Check now**.
- `./start.sh` and `./manage.sh status` print
  `Update available: outpost 0.2.0` too.

Users (not admins) don't see the banner: they can't update.

The request goes to GitHub only and carries nothing about your Pi. Turn it
off with `CORE_UPDATE_CHECK=false` in `.env` and `./start.sh`; see
[Settings](../05-reference/01-settings.md). Offline, the last answer stays.

## Commands

```sh
./update.sh             # show what is new, ask, then update
./update.sh --check     # only show whether a new release is available
```

| Option | Effect |
|---|---|
| `--check` | Only shows whether a new release is available, and what it changes. Changes nothing. |
| `--yes` | Does not ask before updating. |
| `--clean` | Builds every image on this machine, from scratch, instead of downloading it. Slow on a Pi (10 to 30 minutes); use it when an image behaves strangely. |
| `--rebuild` | Reinstalls even when outpost is already up to date. |
| `--help` | Prints the usage. |

## What it does

1. **Checks the checkout.** The project folder must be a Git clone, on a
   branch that has an upstream (for example `origin/main`), without local
   changes to tracked files. Otherwise it stops and tells you what to do
   (`git stash`, `git checkout main`, `git branch -u origin/main`).
2. **Fetches** the new commits and release tags without applying them yet,
   and picks the newest release (pre-releases like `v0.3.0-rc.1` are
   skipped). Without any release it says so and stops.
3. **Shows what is coming**: the installed and the available version
   (for example `0.2.0 (a1b2c3d, 2026-12-01)`), up to 15 of the new
   commits and which modules they touch. What a version changes is in the
   [Changelog](../07-changelog.md).
4. **Asks** (default yes). While the update runs, the modules are
   unavailable for a few minutes.
5. **Applies** the release with a fast-forward merge to its tag
   (`git merge --ff-only`). It never discards local commits or changes.
6. **Hands over to the new `update.sh`**, so that a changed update
   procedure already applies to this update. That part:
   - prints the command to go back (see below),
   - lists settings the new version added to `.env.example` that your
     `.env` does not have yet, with their defaults,
   - runs the new version's `./install.sh --yes`: it keeps every answer
     you gave, puts data folders the new version adds into your data
     folder, downloads the new images (builds them with `--clean`), and
     recreates every container.

New settings need no action: the defaults apply. To change one, add it to
`.env` and run `./start.sh`, or re-run `./install.sh`.

If the download or build fails, the running containers keep their old
images. The code
is already the new version at that point; fix the problem and run
`./start.sh`, or go back.

If both your checkout and the release have commits the other lacks (local
commits), `update.sh` stops. Rebase by hand (`git rebase v<version>`), then
run `./start.sh`.

## Going back

After a successful pull, `update.sh` prints the way back to the version you
had:

```
✔ Updated a1b2c3d (2026-11-01) -> e4f5a6b (2026-11-09)
  Something wrong with the new version? Go back with:
    git reset --hard a1b2c3d && ./start.sh
```

Note the commit before you close the terminal. `git reset --hard` discards
local changes to tracked files; your data and `.env` are not tracked and
stay as they are. Settings or data written by a newer version may not be
understood by an older one, so check the screens after going back.

## When to re-run install.sh

`update.sh` does not ask any questions about modules or storage. Run
`./install.sh` after an update when you want to:

- install a module that the new version added,
- set a new setting that `install.sh` asks for (for example a module's data
  directory).

## See also

- [Everyday commands](01-everyday-commands.md)
- [Backup and restore](03-backup-and-restore.md)
- [Troubleshooting](05-troubleshooting.md)

## From offline-pi to outpost

The project used to be called offline-pi. The first `./start.sh` (or
`./update.sh`) after the rename removes the old `offline-pi-*` containers
and images and creates the `outpost-*` ones. Your data and `.env` stay as
they are.
