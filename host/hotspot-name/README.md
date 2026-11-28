# host/hotspot-name

A name for the Pi on its own Wi-Fi hotspot: phones and laptops that joined
the hotspot open outpost at **`http://basecamp.local:8080`** instead of
`http://10.42.0.1:8080`. Host-level (root, systemd), no container.

`./install.sh` offers it together with the Network module's host helper;
it can also be installed on its own, e.g. next to
[`host/hotspot-pi`](../hotspot-pi).

## Install

```sh
sudo host/hotspot-name/install-hotspot-name.sh                  # name: basecamp
sudo host/hotspot-name/install-hotspot-name.sh --name camp-2    # another name
```

Re-run it to change the name; without `--name` it keeps the current one.
`--connection PROFILE` names the hotspot's NetworkManager profile if it is
not `pi-hotspot` (the one `host/hotspot-pi` and the Network module use).
It installs `avahi-daemon` and `avahi-utils` if they are missing.

## How it works

Devices look up `.local` names in two different ways, so the name is
published both ways while the hotspot runs:

| Way | Who asks this way | How |
|---|---|---|
| mDNS (multicast) | iPhone, iPad, Mac, Windows 10+, Android 12+, Linux | `outpost-hotspot-name.service` runs `avahi-publish -a -R basecamp.local <hotspot address>` |
| DNS | devices that send `.local` to their DNS server (older Android, some others) | NetworkManager's dnsmasq (the hotspot's DHCP and DNS server) reads `/etc/NetworkManager/dnsmasq-shared.d/outpost-hotspot-name.conf`, which points it at `/var/lib/outpost-hotspot-name/hosts` (`basecamp.local` and `basecamp`) |

The NetworkManager dispatcher hook
`/etc/NetworkManager/dispatcher.d/90-outpost-hotspot-name` runs
`/usr/local/bin/outpost-hotspot-name.sh` whenever a connection goes up or
down. For the hotspot profile it writes the hotspot's address to the hosts
file (dnsmasq watches the folder, no restart needed) and starts the mDNS
service on "up", and stops it on "down". So the name follows the hotspot:
`./manage.sh network hotspot on|off`, `host/hotspot-pi` at boot, or a
manual `nmcli connection up pi-hotspot`.

Files:

| File | What |
|---|---|
| `/etc/outpost-hotspot-name.env` | `NAME=` and `CONNECTION=` (written by the installer) |
| `/usr/local/bin/outpost-hotspot-name.sh` | the logic |
| `/etc/NetworkManager/dispatcher.d/90-outpost-hotspot-name` | calls it on up/down |
| `/etc/systemd/system/outpost-hotspot-name.service` | the mDNS announcement (not enabled, started by the hook) |
| `/etc/NetworkManager/dnsmasq-shared.d/outpost-hotspot-name.conf` | `hostsdir=` for the hotspot's dnsmasq |
| `/var/lib/outpost-hotspot-name/hosts` | `<address> <name>.local <name>` |
| `/run/outpost-hotspot-name.env` | the name and address for the service |

## Notes

- The **port** stays in the address (`:8080`, `PORT` in `.env`): a name
  can't carry a port.
- If the Pi's host name already is `basecamp`, avahi announces
  `basecamp.local` itself; the service then stays off and only the DNS
  entry is added.
- avahi announces the name on every interface. While the hotspot runs and
  the Pi is also on a LAN (Ethernet), devices on the LAN get the hotspot
  address for `basecamp.local`, which they can't reach; they keep using
  the Pi's LAN address or `<hostname>.local`.
- Installed while the hotspot runs: mDNS works at once, the DNS answer
  from the hotspot's next start on.
- Check it from the Pi: `avahi-resolve -n basecamp.local`,
  `systemctl status outpost-hotspot-name.service`,
  `journalctl -t outpost-hotspot-name`.

## Uninstall

```sh
sudo host/hotspot-name/uninstall-hotspot-name.sh
```

Removes everything listed above. The hotspot, `avahi-daemon` and
`avahi-utils` stay.
