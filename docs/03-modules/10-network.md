# Network

Network shows who is on the Pi's Wi-Fi hotspot and lets you block a
device. Open it with Network in the module nav (`/network`).

The hotspot is the Wi-Fi network the Pi opens when its preferred Wi-Fi is
not in range (see
[Network and hotspot](../02-installation/03-network-and-hotspot.md#wi-fi-hotspot-fallback)). Everyone who joins it can
use outpost, so this screen tells you who that is.

## The screen

The context line shows the hotspot's name and channel, how many devices
are connected and how many are blocked, for example
`BASECAMP-1 · CH 6 · 3 CONNECTED · 1 BLOCKED`.

The devices are listed in three groups:

- **Connected**: on the hotspot right now, strongest signal first.
- **Blocked**: blocked devices that are not connected.
- **Seen before**: devices that were on the hotspot in the last 30 days.

Each row shows the device's name (the hostname it sent, else its vendor,
else its MAC address), the MAC address, the IP address and the signal or
when it was last seen. The device you are using is marked YOU.

Tap a row to inspect the device:

| Field | Meaning |
|---|---|
| MAC address | The hardware address the device uses on this network. |
| Vendor | The manufacturer, looked up offline in the IEEE registry. |
| IP address | The address the Pi gave it. |
| Hostname | The name the device sent, e.g. `Annas-iPhone`. |
| Signal | In dBm: about -55 or more is strong, -70 good, below -80 very weak. |
| Connected for, Last activity | Since when it is on the hotspot, when it last sent something. |
| Traffic, Link speed | Data sent and received since it joined, its Wi-Fi speed. |
| First seen, Last seen | When it joined the hotspot the first and the last time. |

### Private (randomized) addresses

Most phones and many laptops join each Wi-Fi network with a private,
randomized MAC address. Such an address belongs to no manufacturer, so the
vendor shows as **Private address (randomized)**. The address stays the
same for this hotspot, so you can still recognise and block the device,
unless its owner resets the private address.

## Blocking a device

Open the device, optionally write a note (why it is blocked) and press
BLOCK. If a control PIN is set (`CONTROL_PIN`), the browser asks for it.
Blocking your own device (marked YOU) asks first, because it cuts you off.

A blocked device is disconnected and gets no traffic through the Pi: no
IP address, no outpost and no internet. It may still rejoin the Wi-Fi by
itself, but nothing gets through. UNBLOCK lets it back in. FORGET removes a
device that is gone from the list.

The badge shows whether a block is in force:

- **BLOCKED**: the Pi's firewall drops the device's traffic.
- **BLOCK PENDING**: the block is on the list, but the firewall has not
  applied it. That happens when the blocking helper is not installed.

Blocking needs a small helper on the Pi that changes the firewall (the
module itself runs without root rights). `./install.sh` offers to install
it. If the screen says `Blocking is not enforced`, install it on the Pi:

```bash
./manage.sh network install-guard
```

## Banners

- `No hotspot found`: the Pi has no Wi-Fi interface in access-point mode
  (or none named `NETWORK_IFACE`). On a Mac there is never a hotspot.
- `Hotspot is off`: the Pi is connected to another Wi-Fi as a client, so
  nobody can join it. Devices seen before are still listed.
- `Blocking is not enforced`: the blocking helper is not installed.
- `Blocking helper failed`: its last run failed; the message and
  `journalctl -u outpost-network-guard.service` say why.

## Commands

```bash
./manage.sh network status
./manage.sh network clients
./manage.sh network block aa:bb:cc:dd:ee:ff "unknown laptop"
./manage.sh network unblock aa:bb:cc:dd:ee:ff
```

The settings are listed in [Settings](../05-reference/01-settings.md).
