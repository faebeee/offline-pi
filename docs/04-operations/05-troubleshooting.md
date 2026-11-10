# Troubleshooting

Each entry lists a symptom, its usual cause and the fix. Start with the
places to look below; they often point straight at the problem.

## Where to look

| Where | What it tells you |
|---|---|
| `./manage.sh status` | Which modules are installed and the state of each container. |
| The home page | Each module's badge: Running, Off, Stopped, Not configured, No container, Unhealthy. |
| The Logs screen (`/logs`) | Live log lines of core and every module, filterable by level. |
| `./manage.sh logs [module]` | The same in the terminal, also when the web app does not load. |
| `install.log`, `start.log` | Full output of the last `./install.sh` or `./start.sh` (builds, downloads). |
| The System screen (`/system`) | Under-voltage, throttling, temperature, full disks, container health. |

When in doubt, run `./start.sh`: it rebuilds what changed and recreates
every container. `./install.sh` is safe to re-run too.

## A module shows "Not configured"

**Cause:** the module needs a setting that is still empty. For Mesh that is
`MESH_CONNECTION`, which stays empty when no node was plugged in during
`install.sh`. Core does not start a module that is not configured.
**Fix:** plug the node in (data cable) and run `./install.sh`.

## A module shows "No container"

**Cause:** the module is installed but its container was never created, or
creating it failed (for Mesh: the node was unplugged during `./start.sh`).
**Fix:** run `./start.sh` and read its output for that module.

## A module shows "Stopped", or START fails

**Cause:** the module is switched on but its container is not running. The
badge line shows the last error.
**Fix:** read the module's log (`./manage.sh logs <module>`), then try
START again or run `./start.sh`.

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

## Mesh

The Mesh screen shows "Radio disconnected": the Mesh module cannot talk to
the node. It retries on its own and keeps
showing the message history meanwhile. Check, in this order:

- **Unplugged or charge-only cable.** Use a data cable. `ls
  /dev/serial/by-id/` should list the node.
- **No permission.** Your user must be able to open the serial device
  (usually group `dialout`). `install.sh` checks this and offers to add
  you. Afterwards log out and back in (or reboot) and run `./install.sh`
  again. By hand: `sudo usermod -aG dialout $USER`.
- **ModemManager.** It probes new USB serial devices as modems and can grab
  the node's port. If the radio keeps disconnecting:
  `sudo systemctl disable --now ModemManager`.
- **The node was replugged under another device.** Podman attaches the
  device when the container is created. Run `./install.sh` to pick it
  again, or `./start.sh` if the path is the same.
- **A network node** (`MESH_CONNECTION=tcp`): check that `MESH_HOST` is
  reachable from the Pi.

`./manage.sh mesh status` shows the radio state and the last error.

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

**Cause:** rootless Podman starts containers at boot only through
`podman-restart.service`, and only if your user "lingers" (has its services
running without a login).
**Fix:**

```sh
systemctl --user enable podman-restart.service
sudo loginctl enable-linger $USER
```

`install.sh` does both and warns if it could not. Core then starts the
modules that are switched on. A module you switched off stays off.

## Under-voltage, throttling, SSD drops out

**Cause:** the power supply is too weak for the Pi and its USB devices. The
System screen shows under-voltage or throttling, and the Power events list
records when. An SSD on USB can disconnect under write load; downloads then
fail. `dmesg` shows "USB disconnect".
**Fix:** use the official power supply for your Pi, or give the SSD and the
Meshtastic node their own power (powered hub or enclosure). See
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
- [Logs](../03-modules/07-logs.md)
- [System](../03-modules/06-system.md)
