# Updating

New versions of outpost come from the Git repository you cloned.
`update.sh` installs one: it pulls the new code, rebuilds every image and
recreates every container. Your data and `.env` are kept. The Pi needs
internet access for the update.

## Commands

```sh
./update.sh             # show what is new, ask, then update
./update.sh --check     # only show whether a new version is available
```

| Option | Effect |
|---|---|
| `--check` | Only shows whether a new version is available, and what it changes. Changes nothing. |
| `--yes` | Does not ask before updating. |
| `--clean` | Rebuilds every image from scratch, without the layer cache. Slower; use it when a build behaves strangely. |
| `--rebuild` | Rebuilds and recreates everything even when outpost is already up to date. |
| `--help` | Prints the usage. |

## What it does

1. **Checks the checkout.** The project folder must be a Git clone, on a
   branch that has an upstream (for example `origin/main`), without local
   changes to tracked files. Otherwise it stops and tells you what to do
   (`git stash`, `git checkout main`, `git branch -u origin/main`).
2. **Fetches** the new commits without applying them yet.
3. **Shows what is coming**: the installed and the available version
   (for example `0.2.0 (a1b2c3d, 2026-12-01)`), up to 15 of the new
   commits and which modules they touch. What a version changes is in the
   [Changelog](../07-changelog.md).
4. **Asks** (default yes). While the update runs, the modules are
   unavailable for a few minutes.
5. **Applies** the new version with a fast-forward merge
   (`git merge --ff-only`). It never discards local commits or changes.
6. **Hands over to the new `update.sh`**, so that a changed update
   procedure already applies to this update. That part:
   - prints the command to go back (see below),
   - lists settings the new version added to `.env.example` that your
     `.env` does not have yet, with their defaults,
   - runs `./start.sh --pull` (with `--no-cache` when you passed `--clean`):
     fresh base images, every image rebuilt, every container recreated.

New settings need no action: they are not written to `.env`, and the
defaults apply. To change one, add it to `.env` and run `./start.sh`, or
re-run `./install.sh`.

If the build fails, the running containers keep their old images. The code
is already the new version at that point; fix the problem and run
`./start.sh`, or go back.

If both your checkout and the upstream have new commits, `update.sh` stops.
Merge or rebase by hand (`git pull --rebase`), then run `./start.sh`.

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
