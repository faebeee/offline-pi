# network

Who is on the Pi's Wi-Fi hotspot. Open `http://<pi>:8080/network` to:

- see every device connected right now, with its MAC address, vendor
  (from the IEEE registry, offline), IP address, hostname, signal, how
  long it has been connected, traffic and link speed,
- see devices that were on the hotspot in the last 30 days,
- block a device (with an optional note) and unblock it again,
- forget a device that is gone.

The hotspot is switched on the Pi only (`./install.sh` asks,
`./manage.sh network hotspot on|off`), never from the web app: core has no
endpoint for it, and the passthrough is read only.

The device you are using is marked YOU; blocking it asks first.

Phones and laptops usually join a Wi-Fi network with a private,
randomized MAC address. Those belong to no manufacturer, so the screen says
"Private address (randomized)" instead of a vendor. Such an address stays
the same for one network, so blocking it works until the user resets it
(or turns the private address off and back on).

## How it works

```
browser ──> core /api/network/* ──> network :8085 (rootless container)
                                     ├─ iw dev / iw dev <if> station dump
                                     ├─ /leases/*.leases (NetworkManager's dnsmasq, read-only)
                                     ├─ /proc/net/arp
                                     └─ DATA_DIR: blocked.json, blocked.macs, seen.json,
                                                  hotspot.request
host (root):  outpost-network-guard.path ── watches DATA_DIR/blocked.macs
              outpost-network-guard.service ── nft set inet outpost_network/blocked,
                                               iw station del, DATA_DIR/enforcer.json
              outpost-network-hotspot.path ── watches DATA_DIR/hotspot.request
              outpost-network-hotspot.service ── hotspot-fallback.sh --hotspot (on)
                                                 or nmcli connection down (off),
                                                 DATA_DIR/hotspot.json
```

- The container uses host networking. Reading the station list needs no
  privileges, so it runs unprivileged like every module.
- Changing the firewall needs root, which a rootless container doesn't
  have. So the container only writes the block list to
  `blocked.macs`, and the **host helper** ([`host/network-guard`](../../host/network-guard))
  applies it: a systemd path unit runs `outpost-network-guard.sh` whenever
  the file changes (and once at boot). The script checks every line
  against a strict MAC pattern, puts the MACs into an nftables set whose
  `prerouting` rule drops every packet from them (no DHCP, DNS, web app or
  internet through the Pi), disconnects them from the access point and
  writes `enforcer.json`. The screen reads that file to show whether a
  block is applied (BLOCKED) or not yet (BLOCK PENDING).
- A blocked device may rejoin the Wi-Fi by itself, but it gets no traffic.
- **Hotspot switch** (not in the web app): switching NetworkManager
  connections needs root too.
  The container writes `on` or `off` to `hotspot.request`; a second path
  unit runs `outpost-network-hotspot.sh`, which accepts nothing else. On
  starts the hotspot with `hotspot-fallback.sh --hotspot` from
  [`host/hotspot-pi`](../../host/hotspot-pi) (it creates the `pi-hotspot`
  profile from `/etc/hotspot-fallback.env` if needed), or brings up an
  existing profile when that is not installed. Off takes the profile
  down; NetworkManager then joins the preferred Wi-Fi by itself if it is
  in range. The request may name the interface, `on wlan1` (install.sh
  asks for it): the helper accepts only a Wi-Fi device NetworkManager
  knows, starts the hotspot there (`hotspot-fallback.sh --hotspot --iface`,
  moving it from another interface) and saves it as `WIFI_IFACE` in
  `/etc/hotspot-fallback.env` for the next boot. The result goes to
  `hotspot.json`. Only `install.sh` (which
  writes `hotspot.request` itself, at the very end) and
  `./manage.sh network hotspot` (the container's `POST /api/hotspot`,
  through `podman exec`) ask for a switch. Another profile name: `HOTSPOT_CONNECTION=<name>` in
  `/etc/outpost-network-guard.env`. A request is never applied at boot;
  `hotspot-fallback.service` decides there.
- Without the helper the list still works, but blocks have no effect; the
  screen says so.

The hotspot itself comes from [`host/hotspot-pi`](../../host/hotspot-pi)
(NetworkManager, `ipv4.method shared`). Other setups work too: name the
interface in `NETWORK_IFACE` and point `NETWORK_LEASES_PATH` at the folder
with the dnsmasq lease files.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `NETWORK_PORT` | `8085` | Internal port. |
| `NETWORK_DATA_DIR` | `./data/network` | Block list and the devices seen in the last 30 days (a few KB). |
| `NETWORK_IFACE` | empty | Hotspot interface. Empty: the first Wi-Fi interface in access-point mode. |
| `NETWORK_LEASES_PATH` | `/var/lib/NetworkManager` | Folder with the DHCP lease files, mounted read-only. |

`./install.sh` asks for the data folder and offers to install the host
helper (sudo). Moving the data folder re-points it.

## Commands

```bash
./manage.sh network status            # interface, counts, blocking helper
./manage.sh network clients           # every device: MAC, state, IP, signal, name, vendor
./manage.sh network block MAC [NOTE]  # block a device
./manage.sh network unblock MAC
./manage.sh network hotspot on|off    # switch the hotspot (through the helper)
./manage.sh network install-guard     # (re)install the host helper (sudo)
```

Host helper by hand:

```bash
sudo host/network-guard/install-network-guard.sh [--data-dir DIR]
sudo host/network-guard/uninstall-network-guard.sh
systemctl status outpost-network-guard.path
journalctl -u outpost-network-guard.service
journalctl -u outpost-network-hotspot.service
sudo nft list table inet outpost_network
```

The uninstaller removes the units, the scripts and the nftables table
(every device can connect again) and leaves the hotspot as it is; the
block list stays in the data folder.

## Development

```bash
cd apps/network
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

The parsers take text, so the tests run anywhere. To run the service on a
Mac, put a fake `iw` script on `PATH` and set `DATA_DIR`, `LEASES_DIR` and
`OUI_DIR`.
