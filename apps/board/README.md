# board

A notice board for everyone on the Pi's network: notices, needs, offers
and check-ins. Open `http://<pi>:8080/board`. User
guide: [docs/03-modules/12-board.md](../../docs/03-modules/12-board.md).

Board is a screen core serves itself (like Logs and Info): this folder
holds only its manifest (`"service": "core"`, `"optional": false`,
`"nav": "apps"` so it is listed with the apps, not the system screens).
There is no container and nothing to install.

## How it works

```
browser ──> core /api/board/* ──> BoardStore (apps/core/src/domains/board)
                                   └─ CORE_DATA_DIR/board.json
```

- A post: `kind` (`notice`, `need`, `offer`, `checkin`), `title` (max
  120), `body` (max 4000), `author` (free text, max 60), `pinned`, `done`,
  `createdAt`, `updatedAt`. At most 5000 posts.
- `BoardStore` holds the posts in memory and writes `board.json` on every
  change (temp file + rename, one write at a time).
- Lists sort pinned first, done last, newest change first.
- Every change needs `X-Pi-Monitor` and a login; pinning and deleting are
  control actions (admins only, `assertControl`). `author` is free text,
  not the account.
- The screen (`apps/web/src/features/board/`) polls every 10 s.
