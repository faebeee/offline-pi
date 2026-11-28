# Plan: update check and banner

> **Status (2026-11-28):** U1 to U4 implemented; to verify on a Pi with
> the first release. U5 not started.

## What it is

Core asks GitHub once a day whether a newer **release** of outpost exists
and keeps the answer. The web app shows admins an info banner with the new
version, what changed and the command to run on the Pi. `./update.sh`
installs **releases only**: the newest release tag, never the newest commit
on `main`.

## Decisions

| Question | Decision |
|---|---|
| Check on by default? | **Yes**, once a day and only while the Pi is online. `CORE_UPDATE_CHECK=false` turns it off. |
| What does `update.sh` install? | **Releases only**: `git merge --ff-only v<latest>`. No channel setting. Developers use `git pull` themselves. |
| Who makes the GitHub Release? | **CI, on a tag push**, after the images of that tag are published. |

## What's there today

- The installed version: root `package.json` (`0.1.0`), read by core in
  `apps/core/src/domains/info/infrastructure/docs.reader.ts` (`version()`).
- `./update.sh` fast-forwards the checkout to its upstream (`origin/main`,
  `lib/update.sh`: `fetch_upstream`, `show_incoming`), then re-runs the
  new `update.sh --apply` and `install.sh --yes`.
- `get.sh` clones `main`.
- `InternetService` (`apps/core/src/domains/system/application/internet.service.ts`)
  knows whether the Pi is online.
- `.github/workflows/images.yml` runs on pushes to `main` and on tags
  `v*` and publishes `:sha-<commit>`, `:<version>`, `:latest`.
- No GitHub Release and no tag exist yet.

## Overview

```
tag push v0.2.0
  └─ images.yml: build ─> manifest ─> release (new job)
        gh release create v0.2.0 --notes-file <changelog section>

core (UpdateService, every 24 h, only when NET is online)
  GET https://api.github.com/repos/faebeee/offline-pi/releases/latest
      User-Agent: outpost-update-check, If-None-Match: <etag>
  ──> CORE_DATA_DIR/update.json
  ──> GET /api/system/update, Socket.IO /system "update"

web app (admins only)
  ──> info banner on Home, "Version" card on System

Pi: ./update.sh
  ──> git fetch --tags, git merge --ff-only v<latest>, install.sh --yes
```

## Sessions

### U1: GitHub Release on every tag push

**Goal:** every `v<version>` tag has a GitHub Release whose text is that
version's changelog section, published once its images exist.

**Tasks:**

- [ ] `scripts/release-notes.sh VERSION`: prints the section
  `## <version> (<date>)` of `docs/07-changelog.md` up to the next `## `
  (fails if there is none). Portable Bash (3.2), `awk`.
- [ ] `.github/workflows/images.yml`: a job `release`,
  `needs: manifest`, `if: startsWith(github.ref, 'refs/tags/v')`,
  `permissions: contents: write` on the job only. It checks that the tag
  matches `version` in `package.json`, writes the notes with
  `scripts/release-notes.sh` and runs
  `gh release create "$GITHUB_REF_NAME" --verify-tag --title "outpost <version>" --notes-file notes.md`
  (`--prerelease` when the version has a `-`, e.g. `0.3.0-rc.1`).
  Re-running the job doesn't fail on an existing release (`gh release edit`
  instead).
- [ ] `docs/06-development/10-releases.md`: step 5 says the tag push makes
  the images and then the GitHub Release; how to fix a release text
  (edit the changelog, `gh release edit`).

**Done when:** a test tag on a fork (or `v0.1.0`) produces a Release with
the right text after the images, and a tag that doesn't match
`package.json` fails the job.

### U2: the check in core

**Goal:** core knows whether a newer release exists, also after long
offline periods.

**Tasks:**

- [ ] `apps/core/src/domains/system/application/update.service.ts`:
  first check 2 minutes after start, then every `CORE_UPDATE_CHECK_HOURS`
  (default 24); only when `InternetService` reports online (otherwise the
  next try is when it comes online); timeout 10 s; `If-None-Match` with
  the stored ETag (a 304 doesn't count against GitHub's 60 requests per
  hour).
- [ ] Generic `User-Agent: outpost-update-check`, no instance id or other
  data in the request.
- [ ] SemVer comparison (a small function, no dependency): `available`
  only when `latest > installed`; pre-releases are skipped by
  `/releases/latest` anyway. A build ahead of the newest release shows
  nothing.
- [ ] `CORE_DATA_DIR/update.json` through `JsonFile`:
  `{ latest, releasedAt, notes, url, etag, checkedAt, error }`. Errors are
  kept, without a banner.
- [ ] Settings: `CORE_UPDATE_CHECK` (default `true`),
  `CORE_UPDATE_CHECK_HOURS` (24), `CORE_UPDATE_CHECK_URL` (the API URL, for
  forks or a mirror), in `.env.example`, core's `environment` in
  `compose.yml` (`${VAR:-default}`), `docs/05-reference/01-settings.md`.
- [ ] DTO `UpdateStatus` in `system/domain/`: `installed`, `latest`,
  `available`, `releasedAt`, `notes` (Markdown), `url`, `checkedAt`,
  `enabled`, `error`.
- [ ] `GET /api/system/update` (the system domain is admin only already);
  `POST /api/system/update/check` with `assertControl`, at most once a
  minute.
- [ ] Socket.IO `/system` event `update` with `UpdateStatus`
  (`registerEventModels`, `packages/api-client/src/events.ts`).
- [ ] `npm run api:gen`.
- [ ] Tests (once core has `vitest`, see [sync.md](sync.md) S0a): the
  SemVer comparison, offline skip, 304 handling.

**Done when:** on the Pi with internet `GET /api/system/update` shows the
newest release; offline it keeps the last result; with
`CORE_UPDATE_CHECK=false` no request leaves the Pi.

### U3: the banner and the hints

**Goal:** admins see a new release without looking for it.

**Tasks:**

- [ ] `apps/web/src/features/system/UpdateBanner.tsx`: an info banner
  (DESIGN.md "Banners") on Home for admins only (`useMe().isAdmin`):
  "outpost 0.2.0 is available (installed: 0.1.0). Released 2026-12-03.
  On the Pi: `./update.sh`", actions "What's new" (dialog with the notes,
  rendered like the Info screen renders Markdown) and "Later" (hides it for
  this version: localStorage per browser, in try/catch).
- [ ] A caution banner instead when the notes contain a line starting with
  `Action needed:` (written in the changelog for such releases; noted in
  `10-releases.md`).
- [ ] "Version" card on the System screen: installed, latest, last checked
  ("3 days ago"), the last error, "Check now", the command.
- [ ] Live: `useSocketEvent('/system', 'update', ...)` updates the Query
  cache.
- [ ] Not in the status strip (it is the same on every screen). Optional:
  a dot on the System entry in the nav.
- [ ] `./start.sh` and `./manage.sh status`: `Update available: 0.2.0
  (./update.sh)` read from `CORE_DATA_DIR/update.json`, no network.
- [ ] Docs: `docs/03-modules/05-system.md` (the card),
  `docs/04-operations/02-updating.md` (the banner, turning the check off),
  changelog line.

**Done when:** after publishing a release, an admin sees the banner within
a day (or at once with "Check now"); a user doesn't; "Later" hides it until
the next version.

### U4: update.sh installs releases only

**Goal:** what the banner announces is exactly what `./update.sh`
installs.

**Tasks:**

- [ ] `lib/update.sh`: `fetch_upstream` also fetches tags
  (`git fetch --tags --quiet`) and sets `TARGET` to the highest release tag
  (`git tag -l 'v*' --sort=-v:refname`, without pre-releases, i.e. no `-`)
  instead of `$UPSTREAM`. `BEHIND` and `show_incoming` compare against
  `TARGET`; "Available" shows the version and the release date.
- [ ] `update.sh`: `git merge --ff-only "$TARGET"` instead of the
  upstream. Nothing newer: "outpost is up to date (0.2.0)". A checkout
  ahead of the newest release (installed from `main` before): "Already
  newer than the newest release (0.2.0); the next release will update it",
  nothing changes.
- [ ] `--check` the same, and says when no release exists yet.
- [ ] `require_git_checkout` stays (branch, upstream, no local changes):
  the local branch simply sits on a release commit, behind `origin/main`.
- [ ] `get.sh`: after cloning, `git checkout` the newest release tag's
  commit on `main` (`git reset --hard v<latest>` on the fresh clone), so a
  new install starts on a release too; falls back to `main` while no
  release exists.
- [ ] The way back printed by `update.sh` (`git reset --hard <old> &&
  ./start.sh`) stays.
- [ ] Docs: `docs/04-operations/02-updating.md`,
  `docs/06-development/08-scripts.md`, AGENTS.md ("`update.sh`": releases
  only), changelog line ("`./update.sh` installs releases only").

**Done when:** on the Pi with an older checkout `./update.sh` goes to the
newest tag and not to `main`'s head; a second run says it is up to date;
`get.sh` installs the newest release.

### U5: later, update from the web app

Core runs in a container and can't run `update.sh`. Possible with the
pattern of `host/network-guard`, but as the outpost user, not root: core
writes `update.request` to `CORE_DATA_DIR`, a systemd **user** path unit
(installed by `lib/autostart.sh`) runs `./update.sh --yes` and logs to a
file core shows. It recreates core itself, so it needs `assertControl`, a
confirmation, a clear way back when it fails, and its own security review.
Not planned in detail.

## Order

| Session | Depends on |
|---|---|
| U1 | none |
| U2 | none (shows nothing until a release exists) |
| U3 | U2 |
| U4 | U1 (a release tag to update to) |
| U5 | U4 |

Release `0.1.0` (or the next version) after U1, so the check has something
to find.

## Risks

- **No release yet:** until the first tag, the check finds nothing and
  `update.sh` has nothing to install; both must say so instead of failing.
- **Pis already ahead of the newest release** (installed from `main`):
  they get no update until a release is newer than their `package.json`.
- **GitHub rate limit** (60 per hour per IP, shared by every device behind
  the same router): once a day with ETag stays far below it.
- **Images not ready:** the Release is made only after the `manifest` job,
  so a Pi that updates at once finds the tag's images.
