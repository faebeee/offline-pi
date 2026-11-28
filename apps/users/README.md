# users

The accounts that can open outpost, at `http://<pi>:8080/users` (admins
only). User guide: [docs/03-modules/14-users.md](../../docs/03-modules/14-users.md).

Users is a screen core serves itself: this folder holds only its manifest
(`"service": "core"`, `"optional": false`, `"admin": true`, so only admins
see it in the nav).

## How it works

```
browser ──> core authMiddleware (platform/auth) ── every /api/ and /svc/ request
        ──> core /api/auth/*   state, setup (first run), login, logout, own password
        ──> core /api/users/*  the accounts (admins only)
                └─ CORE_DATA_DIR/users.json (scrypt hashes), sessions.json (token hashes)
```

- **First run**: while `users.json` has no account, `GET /api/auth/state`
  says `setup: true` and the web app asks for the admin account
  (`POST /api/auth/setup`, refused once any account exists). It needs the
  one-time setup code core keeps in `CORE_DATA_DIR/setup.code` (mode 600,
  also logged; `start.sh` prints it, `./manage.sh users setup-code` shows
  it), so only someone with access to the Pi can become admin. Wrong codes
  count against the same brake as wrong passwords; the file is deleted once
  the admin exists.
- **Sessions**: `outpost_session`, an httpOnly, SameSite=Strict cookie with
  a random token; only its SHA-256 is stored. 30 days; logging out, a new
  password or deleting the account ends it.
- **Roles**: `admin` and `user`. `assertControl(piMonitor, user)`
  (`platform/http/control-guard.ts`) lets only admins do control actions;
  `@CurrentUser()` gives a controller the account.
- **Logins** are slowed down per address after 5 wrong passwords (30 s,
  doubling up to 15 minutes).
- **Scripts**: core writes a random local admin token to
  `CORE_DATA_DIR/cli.token` (mode 600) and accepts it only from the machine
  itself (loopback); `core_api` in `lib/modules.sh`
  sends it as `Authorization: Bearer`. `./manage.sh users` lists the
  accounts, `./manage.sh users reset-password NAME` sets a new password.
- Socket.IO namespaces and passthrough WebSockets check the same session.
