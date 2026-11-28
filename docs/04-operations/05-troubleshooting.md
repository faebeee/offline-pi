# Troubleshooting

Each entry lists a symptom, its usual cause and the fix. Start with the
places to look below; they often point straight at the problem.

## Where to look

| Where | What it tells you |
|---|---|
| The Diagnostics screen (`/diagnostics`) | Start here: checks every module, data folder (mounted, writable, free space), the USB drive, power and clock, with a fix for each problem. REPORT downloads the result as a text file. |
| `./manage.sh status` | Which modules are installed and the state of each container. |
| The home page | Each module's badge: Running, Off, Stopped, Not configured, No container, Unhealthy. |
| The Logs screen (`/logs`) | Live log lines of core and every module, filterable by level. |
| `./manage.sh logs [module]` | The same in the terminal, also when the web app does not load. |
| `install.log`, `start.log` | Full output of the last `./install.sh` or `./start.sh` (builds, downloads). |
| The System screen (`/system`) | Under-voltage, throttling, temperature, full disks, container health. |

When in doubt, run `./start.sh`: it gets the images of this version and
recreates every container. `./install.sh` is safe to re-run too.

## A module shows "Not configured"

**Cause:** the module needs a setting (`requires` in its manifest) that is
still empty. Core does not start a module that is not configured.
**Fix:** run `./install.sh` and answer the module's questions.

## A module shows "No container"

**Cause:** the module is installed but its container was never created, or
creating it failed.
**Fix:** run `./start.sh` and read its output for that module.

## A module shows "Stopped", or START fails

**Cause:** the module is switched on but its container is not running. The
badge line shows the last error.
**Fix:** read the module's log (`./manage.sh logs <module>`), then try
START again or run `./start.sh`.

## "Log in first." or the login screen keeps coming back

**Cause:** your login ended: you logged out, it is older than 30 days,
your password was changed or your account deleted, or the browser blocks
cookies. Screens, map tiles and Library pages need a login.
**Fix:** log in again. If the browser keeps forgetting the login, allow
cookies for the Pi's address. See [Users and login](../03-modules/14-users.md).

## "Create the admin account first."

**Cause:** no account exists yet, so outpost waits for the first-run setup.
**Fix:** open the web app and create the admin account with the setup
code (see [Install](../02-installation/01-install.md#first-start)).

## "Wrong setup code."

**Cause:** the code typed on the `Create the admin account` screen is not
the one core made for this outpost.
**Fix:** show it on the Pi with `./manage.sh users setup-code` (or look at
the end of `./start.sh`) and type it again. Case and the dash don't matter.
After a few wrong tries the screen asks you to wait, like a wrong password.

## Forgot the password

**Cause:** nobody knows the password of an account, perhaps of the only
admin.
**Fix:** an admin can set a new password on the Users screen. If no admin
can log in, use a terminal on the Pi:

```sh
./manage.sh users                       # find the user name
./manage.sh users reset-password admin  # asks the new password twice
```

## "Too many wrong passwords. Try again in N seconds."

**Cause:** 5 wrong passwords from your device. Each further try has to wait,
from 30 seconds up to 15 minutes, doubling with every wrong try.
**Fix:** wait the time the message says, then try once with the right
password. Use `./manage.sh users reset-password <name>` if you don't know
it.

## "Only an admin can do this."

**Cause:** starting and stopping modules, blocking devices, the hotspot
switch, deleting files, posts and supplies, pinning posts and managing
accounts are for admins only.
**Fix:** ask an admin, or have an admin make your account an admin on the
Users screen.

## Start and stop do not work: "Podman socket not reachable"

**Cause:** core starts and stops modules through your user's
`podman.socket`. If it is not running, the switches are disabled and the
screens show "Podman socket not reachable (...). Is podman.socket running?".
Module logs on the Logs screen need the socket too.
**Fix:**

```sh
systemctl --user enable --now podman.socket
./install.sh
```

`install.sh` enables the socket and writes its path to `.env`
(`PODMAN_SOCKET`).

## start.sh: "is not available (is the drive mounted?)"

**Cause:** a data directory in `.env` does not exist, usually because the
SSD is not mounted.
**Fix:** mount the drive and run `./start.sh`. To use another location, run
`./install.sh`. See [Storage and SSD](../02-installation/02-storage.md#when-the-drive-is-not-there).

## The web app does not load: port in use

**Cause:** another program already listens on `PORT`, so core cannot start.
`./manage.sh status` shows core restarting or exited, and its log reports
that the address is in use.
**Fix:** find the other program with `ss -ltnp | grep 8080`. Stop it, or
pick another port with `./install.sh` (step 2).

## The web app does not load from another device

**Cause:** `BIND_ADDRESS=127.0.0.1` (only the Pi itself), the device is on
another network, or the Pi's address changed.
**Fix:** check `BIND_ADDRESS` in `.env`, compare the address with
`hostname -I` on the Pi, and make sure both devices are on the same Wi-Fi
or hotspot.

## Nothing comes back after a reboot

**Cause:** the start at boot is off or failed, for example because the USB
drive with the data was not mounted within two minutes.
**Fix:** run `./start.sh`. Check the start at boot with
`./manage.sh autostart status` (`./manage.sh autostart on` to switch it on)
and its log with `journalctl --user -u outpost.service`. A module you
switched off stays off.

## The installer builds the images instead of downloading them

**Cause:** there are no ready-made images for this exact version: the
checkout has local changes (`git status`), the commit is not on GitHub yet
or CI is still building it (a few minutes after a push), or it is a fork
that doesn't publish images (`OUTPOST_REGISTRY`).
**Fix:** wait and re-run, or remove the local changes (`git stash`). The
local build works too, it just takes 10 to 30 minutes on a Pi.

## outpost stops when I log out

**Cause:** your user does not "linger", so systemd stops your containers
when your last session (for example SSH) ends.
**Fix:** `sudo loginctl enable-linger $USER`. `install.sh` does this and
warns if it could not.

## Under-voltage, throttling, SSD drops out

**Cause:** the power supply is too weak for the Pi and its USB devices. The
System screen shows under-voltage or throttling, and the Power events list
records when. An SSD on USB can disconnect under write load; downloads then
fail. `dmesg` shows "USB disconnect".
**Fix:** use the official power supply for your Pi, or give the SSD its own
power (powered hub or enclosure). See
[Hardware](../01-overview/02-hardware.md#power-supply).

## No voltage or throttle readings

**Cause:** not a Pi, or your user cannot open the firmware device.
**Fix:** `install.sh` prints the command, usually
`sudo usermod -aG video $USER`. Log in again and re-run `./install.sh`.

## The containers card is empty

**Cause:** core reads Podman's state database (`db.sql`), which Podman
older than 4.8 does not have. `install.sh` warns about it.
**Fix:** update Podman.

## A build fails

**Cause:** often no internet, a full disk, or a download that failed on the
way.
**Fix:** read the end of `install.log` or `start.log`. Check free space
with `df -h`. Re-run the script; if the error persists, rebuild without the
cache: `./start.sh --no-cache`. A failed build in `start.sh` or `update.sh`
leaves the running containers on their old images.

## Mac: the web app does not answer

**Cause:** the port forwarding from the Mac into the Podman machine is set
up by `start.sh` on every start and is lost when the machine restarts.
`start.sh` warns when it could not set it up.
**Fix:** run `./start.sh` again. See
[macOS](../02-installation/04-macos.md#port-forwarding).

## See also

- [Everyday commands](01-everyday-commands.md)
- [Logs](../03-modules/06-logs.md)
- [System](../03-modules/05-system.md)
