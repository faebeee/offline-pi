# Plan: sync between two outpost instances

> **Status (2026-11):** planned, nothing implemented yet. Written for the
> single-app layout (core domains, `module.json`, one web app).

## What it is

Two outpost instances share data: map regions, library books, the shared
folder (Files), board posts and supplies. The admin chooses per peer and
per dataset what is sent and what is received, sees a preview before
anything changes, and can sync in two ways:

- **Bundle:** export a folder (to the Files folder, then a USB drive),
  import it on the other instance. Works with no network at all.
- **LAN / hotspot:** two paired instances talk core to core over HTTP on
  `PORT`, both directions in one run.

Never synced: accounts, sessions, `cli.token`, `modules.json`, network
settings, settings, supplies settings, the board's `pinned` flag.

## Assumptions (change here if decided otherwise)

- **Scenario:** two instances that meet now and then. A hub (three or more
  instances) comes later (S4).
- **Supplies:** each instance sees the other's stock read-only. Merging
  into one shared list is a later option.
- **Maps and library:** the files are copied. Sending only the "recipe"
  (bbox and zoom, Kiwix names) so the receiver downloads it later is a
  later option.

## Options considered

| Option | Verdict |
|---|---|
| Export/import bundle (USB, Files folder) | **S1.** Offline, robust, the base format for everything else. |
| Peer to peer over LAN or hotspot | **S2.** Same manifest and providers as the bundle, streamed over HTTP. |
| Hub (star) with three or more instances | S4. Falls out of S2 once sync runs automatically. |
| Over the internet (WireGuard, Tailscale) | Host setup outside the app, then the S2 protocol. Not planned separately. |
| Low bandwidth radio (LoRa, Meshtastic) | S4, board posts only. Needs hardware. |

| Dataset | Shape | Mode |
|---|---|---|
| Maps | large, unchanging `.pmtiles` per region | one way, per region |
| Library | large, unchanging ZIMs | one way, per book |
| Files | a folder tree | one way mirror per folder, or two way with conflict copies |
| Board | small records | two way merge, per kind |
| Supplies | small records | read-only view of the peer |

## Constraints from the current code

1. **Core can't write maps or library data.** It sees `MAPS_DATA_DIR` and
   `KNOWLEDGE_CONTENT_DIR` only through the read-only `/hostfs` mount. So
   core can **send** those files but not **receive** them. Rule: **the
   receiving container downloads the file itself from a URL.** Library:
   aria2c in `knowledge.sh` already resumes. Maps: the backend already has
   resumable downloads (`downloads/partial.store.ts`). Importing a bundle
   uses the same path: the container pulls from its own core.
2. **Board and supplies use `nextId++` integers,** which collide between
   instances. They need a global id and tombstones for deletes.
3. **A Pi has no real-time clock.** Offline its clock can be off by days.
   "Last writer wins" therefore uses a **hybrid logical clock (HLC)**, never
   raw `updatedAt`, and cursors use a per-store `seq` counter.
4. **Big files need no hashing.** A ZIM carries its own UUID and checksum,
   a region is identified by `name + build + bytes`. Only Files needs
   SHA-256, cached by `(path, size, mtime)`.
5. **A peer is neither a session nor the `cli.token`.** It needs its own
   principal in `authMiddleware`.
6. **No test setup yet.** The merge logic needs tests, so S0 adds `vitest`
   to core.

## New pieces

```
apps/sync/module.json                      # core screen, "admin": true, "nav": "system"
apps/sync/README.md
apps/core/src/platform/instance/           # instance.json: id, name, HLC
apps/core/src/platform/sync/               # record merge, shared types
apps/core/src/domains/sync/
  sync.module.ts
  api/sync.controller.ts                   # /api/sync/*       (admins: peers, profiles, run, export/import)
  api/peer.controller.ts                   # /api/sync/peer/*  (peers only: manifest, changes, blobs)
  api/pair.controller.ts                   # /api/sync/pair    (public, rate limited)
  application/pairing.service.ts
  application/session.service.ts           # one sync run: preview, pull/push, progress
  application/bundle.service.ts            # export/import to a folder
  application/providers/                   # one per dataset: board, supplies, files, maps, library
  infrastructure/peers.store.ts            # CORE_DATA_DIR/sync/peers.json (mode 600)
  infrastructure/peer.client.ts            # HMAC-signed HTTP to the other core
  infrastructure/blob-tokens.ts            # short-lived signed URLs for big files
  domain/sync.dto.ts
  sync.events.ts                           # Socket.IO /sync: progress, state
apps/web/src/routes/sync.tsx
apps/web/src/features/sync/
lib/modules/sync.sh                        # ./manage.sh sync ...
docs/03-modules/15-sync.md
```

### The provider contract

The core of the design. Each dataset implements it once; the LAN sync and
the bundle both use it.

```ts
interface SyncProvider {
  id: 'board' | 'supplies' | 'files' | 'maps' | 'library';
  manifest(sel: Selection): Promise<Manifest>;                   // what I have that matches this selection
  changes?(sel: Selection, since: Cursor): Promise<RecordBatch>; // record datasets
  applyRecords?(batch: RecordBatch, from: Peer): Promise<ApplyResult>;
  plan(remote: Manifest, local: Manifest, opts): TransferPlan;   // preview: +n, ~n, bytes, free after
  fetchBlob?(item: BlobRef, url: string): Promise<JobRef>;       // receiver: the container pulls the file
  openBlob?(item: BlobRef): Promise<Readable>;                   // sender: stream from /hostfs or /app/files
}
```

### Bundle format

A folder, not an archive, so it can resume and be read in parts.

```
outpost-sync-<instance>-<YYYYMMDD-HHMM>/
  manifest.json        # format version, instance {id,name}, created, selection, items per dataset
  records/board.json   # RecordBatch (only what was selected)
  records/supplies.json
  files/<relpath>      # Files, as a tree
  blobs/maps/<name>.pmtiles
  blobs/library/<file>.zim
  signature            # HMAC-SHA256 over manifest.json + sizes/hashes of every file
```

### Peer API

| Route | Returns |
|---|---|
| `GET /api/sync/peer/hello` | instance, format version, HLC, which datasets this peer may get |
| `GET /api/sync/peer/manifest/:dataset` | the provider's `manifest()`, filtered by this side's send profile |
| `GET /api/sync/peer/changes/:dataset?since=` | `RecordBatch` and the new cursor |
| `POST /api/sync/peer/changes/:dataset` | the push half: applied as far as this side's receive profile allows |
| `GET /api/sync/peer/blob/:id?exp=&sig=` | the file as a stream, with range requests |

### Security rules

- `/api/sync/pair` is the only addition to `PUBLIC_API`: braked like
  logins, an attempt counts when it starts, the pairing code is checked
  again after every `await`.
- `/api/sync/peer/*` is matched with `rulePath()` **before** the admin-only
  rule, and accepts only HMAC-signed requests (`X-Outpost-Peer`,
  `X-Outpost-Ts`, `X-Outpost-Sig` over method, path, timestamp and body
  hash), with a nonce cache against replays. It sets `req.peer`, never
  `req.user`; every other route still answers 401/403 to a peer.
- Big files use short-lived signed URLs, because aria2c can't sign requests.
- **Each side enforces only its own profile:** the sender serves only what
  it marked "send", the receiver applies only what it marked "receive". A
  peer can't widen what it gets.
- Every sync setting and run is an admin action (`assertControl`).
- On the LAN the data itself travels unencrypted (no TLS); documented on the
  user page. Requests and bundles are signed, so tampering is detected.

## Sessions

### S0a: instance identity, HLC, tests

**Goal:** the building blocks every merge needs.

**Tasks:**

- [ ] `apps/core/src/platform/instance/instance.service.ts`:
  `CORE_DATA_DIR/instance.json` with `{ id: uuid, name: hostname }`, the
  name editable later in Settings.
- [ ] `hlc.ts`: `now()` gives `"<ms>-<counter>-<instanceId>"`,
  `receive(remote)` moves the local clock forward; compared as a tuple.
- [ ] `GET /api/system/status` adds `instance: { id, name }` (public, the
  pairing screen needs it).
- [ ] `platform/sync/record-merge.ts`: `mergeRecord(local, remote,
  localOnlyFields)`, higher HLC wins, local-only fields kept.
- [ ] `vitest` in `apps/core` (`test` script, a `turbo.json` task); tests
  for HLC ordering and `mergeRecord`.

**Done when:** `npm run test` passes; nothing changes for users.

### S0b: syncable board and supplies

**Goal:** records with a global id, a clock and tombstones.

**Tasks:**

- [ ] Stored records get `uid`, `origin` (instance id), `hlc`, `seq` and
  `deletedAt: number | null`; `nextId` and numeric `id` stay for the API.
- [ ] Migration on load: records without `uid` get one, `origin` = self,
  `hlc` taken from `updatedAt`.
- [ ] `remove()` writes a tombstone (content cleared), hidden from `list`,
  `status` and the item limits. Purged after 180 days
  (`SYNC_TOMBSTONE_DAYS`); documented: a peer that hasn't synced that long
  may bring deleted posts back.
- [ ] A per-store `seq` counter, raised on every change, stored on the
  record: the cursor for "changes since".
- [ ] Board: `pinned` is local only. Supplies: `settings` are never synced.
- [ ] DTOs: `BoardPost` and `SupplyItem` get `origin: { id, name } | null`
  (`null` = this instance); `npm run api:gen`.
- [ ] Tests: migration, tombstones, merge of a post edited on both sides.

**Done when:** an existing `board.json` and `supplies.json` migrate
without loss, and the screens work as before.

### S0c: manifests

**Goal:** each dataset can say what it has.

**Tasks:**

- [ ] Maps backend: `GET /api/regions/manifest`
  (`[{ name, label, build, bytes, bbox, minzoom, maxzoom }]`, from
  `readAvailable()`); core's maps client reads it.
- [ ] Library: the manifest built in core from `content-dir.ts`
  (`[{ key, file, bytes, title }]`); no container change.
- [ ] Files: `files-index.ts` walks `/app/files`, SHA-256 cached by
  `(path, size, mtime)` in `CORE_DATA_DIR/sync/files-index.json`.

**Done when:** all three manifests are correct on the Pi with a few GB of
data, and a second index run reads only the cache.

### S1a: bundle export/import, records and files

**Goal:** board, supplies and folders go from one instance to the other on
a USB drive.

**Tasks:**

- [ ] `apps/sync/module.json` (core screen, admin only, nav "system"),
  `sync.module.ts` in `app.module.ts`.
- [ ] Providers for board, supplies (view mode: stored in
  `CORE_DATA_DIR/sync/peers/<id>/supplies.json`) and files.
- [ ] `POST /api/sync/export`: a job writing the bundle to the Files folder
  `Sync/`; streams, no `fs.copyFile` (exFAT rule). A records-only export
  also as one `.json` download.
- [ ] `GET /api/sync/import/preview?path=` and `POST /api/sync/import`:
  the path in the Files folder or under `/hostfs` (allow-list, no `proc`,
  `sys`, ...). The preview shows new, changed, conflicting, bytes, free
  space after; items can be unticked.
- [ ] Files: write to `.partial`, then rename; conflicts become
  `name (from <instance>).ext`. A free-space check like `FILES_MIN_FREE_MB`.
- [ ] Signature: an optional passphrase per export (HMAC).
- [ ] Socket.IO `/sync` with `progress` events, added to
  `packages/api-client/src/events.ts`.

**Done when:** a bundle made on the Mac imports on the Pi from a USB
drive, board posts merge both ways (two bundles), and a tampered bundle is
refused.

### S1b: containers pull big files

**Goal:** regions and ZIMs arrive through their own container.

**Tasks:**

- [ ] Core: a one-time loopback blob token,
  `GET /api/sync/blob/<token>` (loopback peer only), with range support.
- [ ] Maps backend: `POST /api/imports { url, region }`, a job reusing
  `download.service` and `partial.store`; checks the size, then
  `registry.upsert()` and the same follow-up step as a normal region
  download (places index). Progress through the existing jobs feed.
- [ ] `knowledge.sh fetch URL FILE SIZE`: aria2c with `--continue`, no
  metalink; adds the key to the selection so `prune` keeps it, then
  `build_library`. Core calls it through `KnowledgeCommands.fetch()`.
- [ ] Providers for maps and library (`openBlob` from `/hostfs`,
  `fetchBlob` through the container).

**Done when:** a region and a ZIM import from a bundle, and an import cut
off halfway resumes after `./start.sh`.

### S2a: pairing and the peer principal

**Goal:** two instances trust each other, and nothing else.

**Tasks:**

- [ ] `POST /api/sync/pair/code` (`assertControl`): an 8-character code,
  valid 10 minutes, one-time.
- [ ] `POST /api/sync/pair { code, instance, url, secretShareB }` (public,
  braked): A answers `{ instance, secretShareA }`; both derive the secret
  (HKDF) and store the peer in `CORE_DATA_DIR/sync/peers.json` (mode 600)
  with an empty profile.
- [ ] Unpairing: removes the peer here, tells the other side (best effort).
- [ ] `platform/auth/peer-auth.ts` and the `PEER_API` rule in
  `auth.middleware.ts` (see "Security rules"); the time window uses the
  clock offset learned at pairing (±10 min) and a nonce cache.
- [ ] Signed blob URLs (`blob-tokens.ts`).
- [ ] Tests: a peer token can't reach `/api/users`, `/api/sync/peers`,
  `/svc/`; a changed body, an old timestamp, a reused nonce are refused.
- [ ] Run `/security-review` on this session's change.

**Done when:** Mac and Pi pair over the hotspot, and the tests above pass.

### S2b: LAN sync run

**Goal:** "Sync now" moves what both profiles allow, both ways.

**Tasks:**

- [ ] Profiles in `peers.json`: per dataset `{ send, receive, items }`
  (region names, ZIM keys, folders, board kinds, supplies `view`).
- [ ] `peer.controller.ts` with the routes of "Peer API".
- [ ] `session.service.ts`: `POST /api/sync/peers/:id/preview` (held 10
  minutes), `POST /api/sync/peers/:id/run`; records pulled then pushed,
  cursors saved only after a successful apply; files streamed by core,
  regions and ZIMs pulled by the container from a signed peer URL; one run
  at a time.
- [ ] A free-space check before every big file; optional `SYNC_MAX_MBPS`
  (`.env.example`, core env in `compose.yml`, settings table).
- [ ] `/sync` events: `state`, `progress`, `done`, `error`.

**Done when:** Mac and Pi sync board, supplies, a folder, a region and a
ZIM in one run, and a run cut off by a Wi-Fi drop finishes on the next
"Sync now" without sending everything again.

### S3: Sync screen and the other screens

**Goal:** everything above usable from the web app.

**Tasks:**

- [ ] `routes/sync.tsx`: `<Screen module="sync">` with `<AdminOnly>`.
- [ ] `features/sync/`: `PeerList` (name, last sync, reachable, Sync now,
  unpair), `PairDialog` (show code / enter code), `ProfileEditor` (send and
  receive per dataset; pickers from `useMapsRegions()`, the library list,
  the Files listing, board kinds), `PreviewSheet`, `RunProgress`
  (`useSocketEvent('/sync', ...)`), `BundlePanel` (export, import).
- [ ] Board: an origin badge ("from Base camp").
- [ ] Supplies: a read-only tab with the peer's stock.
- [ ] Missing components (peer row, transfer bar) in `packages/ui` with
  tokens only, noted in the `DESIGN.md` changelog.
- [ ] `lib/modules/sync.sh`: `./manage.sh sync peers|now <peer>|export
  <files-subdir>|import <path>` through `core_api`.
- [ ] Docs: `docs/03-modules/15-sync.md`, rows in the module tables (root
  README, `docs/01-overview/README.md`), `apps/sync/README.md`, the
  bundle format in `docs/05-reference/`, a note in
  `docs/04-operations/03-backup-and-restore.md`.
- [ ] `AGENTS.md`: the peer principal under "Accounts and login", the
  `SyncProvider` contract under "Core: domains" (a new module holding user
  data implements a provider).
- [ ] Changelog lines under `## Unreleased`.

**Done when:** pairing, profile, preview, sync and bundle work from the
browser on the Pi, as an admin; a user sees no Sync screen.

### S4: later

- mDNS discovery (`_outpost._tcp`, `bonjour-service`; works with host
  networking).
- Automatic sync when a known peer shows up; hub topology.
- Recipe mode for maps and library.
- Two way merge for supplies.
- Board posts over LoRa / Meshtastic.

## Order

| Session | Depends on |
|---|---|
| S0a | none |
| S0b | S0a |
| S0c | none |
| S1a | S0b, S0c |
| S1b | S0c |
| S2a | S0a |
| S2b | S1a, S1b, S2a |
| S3 | S2b |

## Risks

- **The peer principal in `authMiddleware`** is security-critical: S2a has
  its own tests and a security review.
- **Clock drift** on a Pi without RTC: HLC for merges, `seq` for cursors,
  the pairing offset for request timestamps.
- **Big writes on the Pi's SSD**, which already drops out on the 3A supply:
  `SYNC_MAX_MBPS`, resumable `.partial` files, a free-space check before
  each file.
