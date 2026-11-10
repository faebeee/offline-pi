# Network and hotspot

offline-pi is reached on one port of the Pi. Who can reach it depends on
two settings and on the network the Pi is connected to.

## Settings

`install.sh` asks for these in step 2 on the first run. Later runs show the
current values and ask whether you want to change them.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | The one port offline-pi uses on the Pi: web app, API and every module. |
| `BIND_ADDRESS` | `0.0.0.0` | `0.0.0.0`: every device on the network (LAN, Wi-Fi hotspot). `127.0.0.1`: only the Pi itself. |
| `CONTROL_PIN` | empty | PIN asked before a module is started or stopped from the web app. Empty: anyone who can open the web app can do it. |

You can also edit them in `.env` and run `./start.sh`.

`MODULES_BIND_ADDRESS` (default `127.0.0.1`) is the address the modules
listen on. Keep it: the modules are meant to be reached only through core.

## The address to open

At the end of every `./start.sh` you see:

```
  Local:   http://localhost:8080
  LAN:     http://192.168.1.20:8080
```

The LAN line shows the Pi's first IP address and is left out when
`BIND_ADDRESS` is `127.0.0.1`. Open it on any device on the same network.
The address can change when the Pi joins another network; `hostname -I` on
the Pi shows the current one.

## Access and PINs

offline-pi has no user accounts. Anyone who can open the web app can read
maps, books, messages and logs. Three settings limit what they can do:

- `CONTROL_PIN`: required to start and stop modules. The web app asks for
  it once per browser tab. `./manage.sh start|stop` sends it for you.
- `MESH_SEND_PIN`: required to send Meshtastic messages from the web app.
- `BIND_ADDRESS=127.0.0.1`: nobody but the Pi itself can open offline-pi.

## Wi-Fi hotspot fallback

`host/hotspot-pi` is an optional utility that runs on the Pi itself, outside
the containers. At every boot it:

1. scans for your preferred Wi-Fi network,
2. connects to it as a normal client if it is in range,
3. otherwise opens its own Wi-Fi hotspot on the same interface.

Phones and laptops can then join the hotspot and open offline-pi at the
Pi's address on that network. The hotspot uses NetworkManager's "shared"
mode, which gives clients an address by DHCP; the Pi itself is usually
`10.42.0.1` there (NetworkManager's default), so the web app is at
`http://10.42.0.1:8080`.

It needs Raspberry Pi OS Bookworm or newer (NetworkManager and `nmcli`).

### Install

```sh
cd host/hotspot-pi
sudo ./install-hotspot-fallback.sh
sudo nano /etc/hotspot-fallback.env
```

The installer copies the script to `/usr/local/bin/hotspot-fallback.sh`,
creates `/etc/hotspot-fallback.env` from the template (only if it does not
exist yet, readable by root only) and enables `hotspot-fallback.service`.
Fill in the settings before you reboot:

```ini
WIFI_IFACE=wlan0
PREFERRED_SSID="YourHomeWifi"
PREFERRED_PASSWORD="homepassword"
HOTSPOT_SSID="PiHotspot"
HOTSPOT_PASSWORD="hotspotpassword"
```

| Setting | Description |
|---|---|
| `WIFI_IFACE` | The Wi-Fi interface (see `nmcli device status`). |
| `PREFERRED_SSID` / `PREFERRED_PASSWORD` | The network to join when it is in range. |
| `HOTSPOT_SSID` / `HOTSPOT_PASSWORD` | The hotspot to open otherwise (WPA, so the password needs at least 8 characters). |

Test it without rebooting and watch what it does:

```sh
sudo systemctl start hotspot-fallback.service
journalctl -u hotspot-fallback.service -f
```

The script creates two NetworkManager connection profiles,
`preferred-wifi` and `pi-hotspot`. It runs once per boot: if your Wi-Fi
comes into range later, the Pi stays on the hotspot until the next boot or
until you start the service again.

If you connect to the Pi over SSH through Wi-Fi, keep in mind that the
connection drops when the Pi switches to the hotspot.

### Uninstall

```sh
cd host/hotspot-pi
sudo ./uninstall-hotspot-fallback.sh           # keeps /etc/hotspot-fallback.env
sudo ./uninstall-hotspot-fallback.sh --purge   # also deletes it (it holds your Wi-Fi passwords)
```

It stops and disables the service, removes the script and the unit file,
and deletes the two connection profiles.

## See also

- [Hardware](../01-overview/02-hardware.md#wi-fi-and-hotspot)
- [Troubleshooting](../04-operations/05-troubleshooting.md)
- [Settings](../05-reference/01-settings.md)
