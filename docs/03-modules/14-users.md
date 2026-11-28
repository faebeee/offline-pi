# Users and login

outpost needs a login. Every screen, the map tiles, the Library pages and
the live updates are only for people with an account. Accounts have one of
two roles: **admin** or **user**. Admins manage the accounts on the Users
screen (`/users`).

## First run: create the admin account

As long as no account exists, outpost shows `Welcome` and
`Create the admin account` instead of the login:

1. Enter the **setup code**: `./install.sh` and `./start.sh` print it at
   the end (for example `K7Q2-9MXD`), and `./manage.sh users setup-code`
   shows it again. Upper or lower case and the dash don't matter.
2. Enter a user name (`admin` by default).
3. Enter a password of at least 8 characters, and the same password again.
4. Press the button. outpost creates the account and logs you in.

The setup code makes sure the admin is someone with access to the Pi, not
whoever on the network opens outpost first. Only the user running outpost
can read it (`setup.code` in `CORE_DATA_DIR`, and core's log). It stays the
same until the admin account exists, then it is deleted. Wrong codes count
like wrong passwords (see [Logging in](#logging-in)).

An outpost that was installed before accounts existed shows the same screen
on the first visit after the update.

## Logging in

Open `http://<pi>:8080` and enter your user name and password. The login
lasts 30 days in this browser, also when the Pi or outpost restarts. A link
to a map or a Library page opened without a login takes you to the login
first.

After 5 wrong passwords from the same device, each further try has to wait:
30 seconds at first, then twice as long after each wrong try, up to 15
minutes. The screen says
`Too many wrong passwords. Try again in N seconds.`

## The account button

Every screen's header has an account button (a person icon) next to the
theme button. It opens a dialog with:

- your user name and your role,
- `Manage users` (admins only): opens the [Users screen](#the-users-screen),
- changing your own password: enter the current one and the new one
  (at least 8 characters). Your other devices are logged out; this one
  stays logged in,
- `Log out`.

## Admins and users

Users can do everything you need day to day: open and use the apps (Maps,
Library, Network, Files, Board, Supplies, Info), download map regions and
books, save places, upload and rename files, post on the Board, edit posts
and mark them done, add and change supplies.

Only admins can open the screens of outpost itself:
[System](05-system.md), [Logs](06-logs.md), [Settings](08-settings.md),
[Diagnostics](09-diagnostics.md) and Users. They are not in a user's nav
or on the home page, and opening one by its address shows
`Admins only`. The status strip at the top (temperature, voltage, CPU,
memory, disk, internet) stays visible to everyone.

Only admins can also do the control actions:

- start and stop modules: the switches on [Home](01-home.md), START on the
  module gate, the containers card on [System](05-system.md),
- block, unblock and forget devices and switch the hotspot on
  [Network](10-network.md),
- delete shared files and folders on [Files](11-files.md),
- pin and delete posts on the [Board](12-board.md),
- delete items on [Supplies](13-supplies.md),
- manage accounts on the Users screen.

A user sees the module switches disabled with
`Only an admin can switch modules on and off.`, and the module gate says
`Ask an admin to start it`. Other admin-only actions answer with
`Only an admin can do this.`

## The Users screen

Admins open it with `Manage users` in the account dialog, or with Users in
the module nav (`/users`). Users don't see it.

The list shows every account, admins first, with its role badge. Each row
has:

| Control | What it does |
|---|---|
| Role | `User` or `Admin`. |
| New password | Sets a new password for the account. |
| Delete | Deletes the account, after a question. |

ADD USER creates an account:

| Field | Rule |
|---|---|
| User name | 1 to 32 letters, digits, dots, dashes or underscores. Stored in lower case. |
| Password | At least 8 characters. |
| Role | `User` or `Admin`. |

Some changes are refused, so outpost always keeps an admin:

- You can't delete your own account.
- The last admin can't be deleted or made a user.

Setting a new password for an account or deleting it logs that account out
on every device.

## Forgot the password

If nobody knows an admin password any more, set a new one in a terminal on
the Pi:

```bash
./manage.sh users                       # list the accounts and their roles
./manage.sh users reset-password admin  # asks the new password twice
```

The new password is not shown while you type it. The account is logged out
on every device. See
[Everyday commands](../04-operations/01-everyday-commands.md).

## Where the accounts are

The accounts are in `CORE_DATA_DIR` (`./data/core` by default):

| File | What it holds |
|---|---|
| `users.json` | User names, roles and the password hashes (never the passwords). |
| `sessions.json` | The logins. Only a hash of each login token, not the token. |
| `cli.token` | A token core writes at every start, so `./manage.sh` can talk to core as an admin. Core accepts it only from the Pi itself, never over the network. |
| `setup.code` | The first-run setup code, only while no account exists. |

Only the user running outpost can read these files. Back up `users.json`
(see [Backup and restore](../04-operations/03-backup-and-restore.md)): if it
is lost, outpost asks for a new admin account again.

## Security notes

- The login is a cookie in your browser that scripts on a page can't read
  and that is never sent by other websites.
- Logging out, changing the password or deleting the account ends a login.
- Anyone who can reach outpost can try to log in. Use long passwords on an
  open hotspot, and [Network](10-network.md) to block devices that
  misbehave.
- outpost serves plain HTTP. On a network you don't trust, someone could
  read the traffic, including the password when you log in.
