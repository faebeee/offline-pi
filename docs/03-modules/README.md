# Modules

outpost is one web app. Open `http://<pi>:8080` in any browser on the
same network or hotspot as the Pi (the port is `PORT` in `.env`, 8080 by
default). Every module is a screen of that app: Maps, Library, Mesh, Mesh
map, plus System, Logs and Info, which are always there. This chapter
explains how to use each screen.

Nothing in the app loads from the internet. Fonts, icons, map styles and
the app itself come from the Pi. Only a few actions need an internet
connection, and the screen says so where they are (downloading map regions
and library books).

The first time you open the app in a browser tab, a short start-up
animation plays. Tap the screen or press any key to skip it.

## The frame every screen shares

Every screen has the same frame, from top to bottom: the status strip, the
header, the content and the module nav.

### Status strip

The thin bar at the very top. It is exactly the same on every screen, so
you always see how the Pi is doing.

On the left is a square LED with the link between your browser and the Pi:

| LED | Text | Meaning |
|---|---|---|
| Green | `CORE · LIVE` | The Pi answers |
| Amber | `CORE · CONNECTING` | Reaching the Pi |
| Red | `CORE · OFFLINE` | The Pi does not answer |

Then the Pi's vitals: CPU temperature (`TEMP`), input voltage (`VOLT`), CPU
and memory usage (`CPU`, `MEM`) and the system disk (`DISK 23/57 GB`), in
amber or red when they need attention (see [System](05-system.md)). On a
phone they get a second line. The last item is always the time in UTC
(`14:32Z`). All times in the app are UTC, so they match between devices and
radio messages.

What belongs to one screen (its regions, the radio link, sync progress) is
shown on the screen itself, in the context line under the header or in a
banner.

### Header

Below the strip: the module name as a small label, the screen title, and on
the right the screen's own buttons (for example a back button) and the
day/night toggle. The toggle switches between the dark theme (the default)
and the light theme. Your choice is stored in this browser. Use the light
theme in bright sunlight and the dark theme at night. Maps follow the theme
too.

Some screens have a context line under the header with more detail, such
as the map zoom and coordinates, or the radio region and preset on Mesh.

### Module nav

The nav lists Home and every installed module. On a phone it is a bar at
the bottom of the screen. On a wide screen (900 px and up) it becomes a
rail on the left. The current screen is highlighted.

A module that is installed but stopped stays in the nav, dimmed. You can
still open it: it shows the module gate (below) with a button to start it.

## The module gate

When you open an optional module that is not running, you see a banner in
place of its screen. It tells you why and what to do:

| Banner | What it means | What to do |
|---|---|---|
| `<Module> is not installed` | The module was not chosen during installation | Re-run `./install.sh` on the Pi and select it |
| `<Module> is not configured` | A required setting is missing (for Mesh: the radio connection) | Re-run `./install.sh` on the Pi |
| `<Module> is not running` | Installed, but stopped | Press the START button (for example START MAPS). The screen opens as soon as the module is up |
| `Core is not reachable` | The browser cannot reach the Pi at all | Check the network, then see [Troubleshooting](../04-operations/05-troubleshooting.md) |

If core cannot control the containers (for example because the Podman
socket is missing), the banner shows the reason instead of a START button.
If a control PIN is set (`CONTROL_PIN`), the browser asks for it before it
starts or stops a module. See [Home](01-home.md#the-control-pin).

## Pages

- [Home](01-home.md): the module tiles, their state badges and the switches
  to start and stop modules.
- [Maps](02-maps.md): download map regions once, then use them offline,
  with saved places and, with Mesh installed, the Meshtastic nodes as a
  layer you can switch on and off.
- [Library](03-library.md): choose, download, read and search offline
  books such as medical guides and Wikipedia.
- [Mesh](04-mesh.md): text messages over a Meshtastic LoRa radio, without
  internet or phone network.
- [System](05-system.md): temperature, power, CPU, memory, storage,
  network, containers and connections of the Pi.
- [Logs](06-logs.md): the log lines of core and every module, for finding
  problems.
- [Info](07-info.md): this documentation inside the app.
