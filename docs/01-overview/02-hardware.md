# Hardware

offline-pi runs on a Raspberry Pi or any Linux machine with Podman. A Mac
works for development, see [macOS](../02-installation/04-macos.md). This page
covers what to plan for on a Pi.

## Raspberry Pi

A Raspberry Pi 5 gets the most out of offline-pi. Other models and other
Linux machines work too, but the System screen shows fewer readings there: the
input voltage, the power supply's negotiated current and the RP1 chip
temperature come from Pi 5 hardware. On a machine that is not a Pi, the
voltage and throttling readings are missing altogether.

The first build of the images takes a while on a Pi (10 to 30 minutes).
Later builds reuse the cache and are much faster.

## SD card or SSD

The system and offline-pi itself live on the SD card. The question is where
the data goes:

| Data | Size | Where |
|---|---|---|
| Dashboard history, module state | under 1 MB | SD card is fine |
| Mesh message history | small | SD card is fine |
| Map fonts and sprites | about 100 MB | SD card is fine |
| Map regions | from MB to many GB | SSD recommended |
| Library books | from MB to hundreds of GB | SSD recommended |

An SSD on USB gives you much more room and handles constant writes better
than an SD card. But it only helps if it gets enough power (next section).
How to point the data at an SSD is on [Storage and SSD](../02-installation/02-storage.md).

## Power supply

Use a power supply that can deliver what the Pi and everything on its USB
ports need. This matters more than it seems.

A real-world case from this project: a Pi 5 ran on a 3 A USB-C supply with
an external USB SSD. The Pi 5 then limits all USB ports together to
600 mA. Under sustained writes (map and book downloads) the SSD dropped off
the USB bus again and again, and downloads failed. The data had to be moved
back to the SD card to work reliably.

To avoid this:

- Use the official Raspberry Pi power supply for your model. For a Pi 5
  that is the 27 W (5 V, 5 A) supply, which lets the USB ports deliver up
  to 1.6 A.
- Or give the SSD its own power: a powered USB hub, or an SSD enclosure
  with its own power supply.
- The same applies to a Meshtastic node on USB when the supply is already
  at its limit: plug it into a powered hub.

The **System** screen shows whether power is a problem. Its health banner
reports under-voltage or throttling, now or since boot. The Power card
shows the input voltage, the current the supply negotiated and the USB
current limit (600 mA or 1.6 A). The Power events list records when
under-voltage or throttling started and ended. See
[System](../03-modules/06-system.md).

If the voltage and throttle readings are missing, your user is probably not
allowed to open the Pi's firmware device. `install.sh` prints the fix (add
your user to the device's group, usually `video`).

## Meshtastic node

The Mesh module needs a Meshtastic LoRa node. The usual setup is a node
plugged into the Pi by USB:

- Any Meshtastic node with USB serial works (for example RAK WisBlock 4631,
  Heltec V3, LilyGO T-Beam, Seeed XIAO nRF52840). nRF52 boards draw the
  least power.
- Use a **data cable**. A charge-only cable powers the node, but the Pi
  sees no serial device.
- Use the frequency band and region of your country (in Switzerland and
  the EU: 868 MHz hardware, region `EU_868`) and always connect the
  antenna before the node gets power.
- Flash current Meshtastic firmware before plugging the node into the Pi.
- The node must be plugged in when `./start.sh` runs: Podman attaches the
  device when it creates the container.

A node on the network (Wi-Fi or Ethernet, by hostname or IP) works as well.
`install.sh` asks which one you use.

## Wi-Fi and hotspot

Phones and laptops reach offline-pi over the network the Pi is on: your
home Wi-Fi, Ethernet, or a hotspot the Pi opens itself. When there is no
known Wi-Fi around (outdoors, during an outage), the optional
`host/hotspot-pi` utility makes the Pi open its own Wi-Fi hotspot at boot.
See [Network and hotspot](../02-installation/03-network-and-hotspot.md).

## See also

- [Storage and SSD](../02-installation/02-storage.md)
- [Troubleshooting](../04-operations/05-troubleshooting.md)
- [Mesh](../03-modules/04-mesh.md)
