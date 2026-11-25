"""Where the hotspot's clients come from, read without privileges.

- `iw dev`: the Wi-Fi interfaces, their mode (AP = hotspot) and SSID.
- `iw dev <if> station dump`: the stations associated right now, with
  signal, connected time and traffic (nl80211 lets any user read these).
- dnsmasq lease files (NetworkManager's shared mode runs its own dnsmasq,
  /var/lib/NetworkManager/dnsmasq-<if>.leases): IP and hostname.
- /proc/net/arp: IPs of clients without a lease (static addresses).

The container uses the host network namespace, so all of these describe
the Pi. Every parser takes text so the tests can feed it samples.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

MAC_RE = re.compile(r"^[0-9a-f]{2}(:[0-9a-f]{2}){5}$")


def normalize_mac(value: str) -> str | None:
    """'AA-BB-CC-DD-EE-FF' / 'aabb.ccdd.eeff' -> 'aa:bb:cc:dd:ee:ff', else None."""
    hexdigits = re.sub(r"[^0-9a-fA-F]", "", value or "")
    if len(hexdigits) != 12 or len(re.sub(r"[0-9a-fA-F:.\-\s]", "", value)) != 0:
        return None
    mac = ":".join(hexdigits[i : i + 2] for i in range(0, 12, 2)).lower()
    return mac if MAC_RE.match(mac) else None


def run_iw(*args: str) -> str | None:
    """stdout of `iw ARGS`, None when iw is missing or fails."""
    try:
        res = subprocess.run(["iw", *args], capture_output=True, text=True, timeout=5, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return res.stdout if res.returncode == 0 else None


@dataclass
class Interface:
    name: str
    type: str | None = None  # "AP", "managed", ...
    ssid: str | None = None
    addr: str | None = None
    channel: int | None = None


def parse_iw_dev(text: str) -> list[Interface]:
    out: list[Interface] = []
    cur: Interface | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("Interface "):
            cur = Interface(name=line.split(None, 1)[1])
            out.append(cur)
        elif cur is None:
            continue
        elif line.startswith("type "):
            cur.type = line[5:].strip()
        elif line.startswith("ssid "):
            cur.ssid = line[5:]
        elif line.startswith("addr "):
            cur.addr = normalize_mac(line[5:].strip())
        elif line.startswith("channel "):
            m = re.match(r"channel (\d+)", line)
            cur.channel = int(m.group(1)) if m else None
        elif line.startswith("phy#"):
            cur = None
    return out


@dataclass
class Station:
    mac: str
    signal_dbm: int | None = None
    signal_avg_dbm: int | None = None
    connected_seconds: int | None = None
    inactive_ms: int | None = None
    rx_bytes: int | None = None
    tx_bytes: int | None = None
    rx_bitrate: str | None = None
    tx_bitrate: str | None = None
    authorized: bool | None = None


def _int(value: str) -> int | None:
    m = re.match(r"\s*(-?\d+)", value)
    return int(m.group(1)) if m else None


def _bitrate(value: str) -> str | None:
    m = re.match(r"\s*([\d.]+)\s*MBit/s", value)
    return f"{float(m.group(1)):g} Mbit/s" if m else None


def parse_station_dump(text: str) -> dict[str, Station]:
    out: dict[str, Station] = {}
    cur: Station | None = None
    for raw in text.splitlines():
        if raw.startswith("Station "):
            mac = normalize_mac(raw.split()[1])
            cur = Station(mac=mac) if mac else None
            if cur:
                out[mac] = cur
            continue
        if cur is None or ":" not in raw:
            continue
        key, _, value = raw.strip().partition(":")
        key = key.strip()
        if key == "signal":
            cur.signal_dbm = _int(value)
        elif key == "signal avg":
            cur.signal_avg_dbm = _int(value)
        elif key == "connected time":
            cur.connected_seconds = _int(value)
        elif key == "inactive time":
            cur.inactive_ms = _int(value)
        elif key == "rx bytes":
            cur.rx_bytes = _int(value)
        elif key == "tx bytes":
            cur.tx_bytes = _int(value)
        elif key == "rx bitrate":
            cur.rx_bitrate = _bitrate(value)
        elif key == "tx bitrate":
            cur.tx_bitrate = _bitrate(value)
        elif key == "authorized":
            cur.authorized = value.strip() == "yes"
    return out


@dataclass
class Lease:
    mac: str
    ip: str
    hostname: str | None
    expires: int | None  # unix seconds, None = never


def parse_leases(text: str) -> dict[str, Lease]:
    """dnsmasq lease file: `<expiry> <mac> <ip> <hostname|*> <client id|*>`."""
    out: dict[str, Lease] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 4 or not parts[0].isdigit():
            continue
        mac = normalize_mac(parts[1])
        if not mac or ":" in parts[2]:  # skip DHCPv6 entries
            continue
        expiry = int(parts[0])
        out[mac] = Lease(mac=mac, ip=parts[2], hostname=None if parts[3] == "*" else parts[3], expires=expiry or None)
    return out


def read_leases(directory: Path) -> dict[str, Lease]:
    """Every *.leases file in DIRECTORY, newest lease per MAC wins."""
    out: dict[str, Lease] = {}
    try:
        files = sorted(directory.glob("*.leases"))
    except OSError:
        return out
    for f in files:
        try:
            leases = parse_leases(f.read_text(errors="replace"))
        except OSError:
            continue
        for mac, lease in leases.items():
            old = out.get(mac)
            if old is None or (lease.expires or 1 << 62) >= (old.expires or 1 << 62):
                out[mac] = lease
    return out


@dataclass
class ArpEntry:
    mac: str
    ip: str
    device: str


def parse_arp(text: str) -> list[ArpEntry]:
    out: list[ArpEntry] = []
    for line in text.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 6 or parts[2] == "0x0":  # incomplete
            continue
        mac = normalize_mac(parts[3])
        if mac and mac != "00:00:00:00:00:00":
            out.append(ArpEntry(mac=mac, ip=parts[0], device=parts[5]))
    return out


def read_arp(path: Path = Path("/proc/net/arp")) -> list[ArpEntry]:
    try:
        return parse_arp(path.read_text())
    except OSError:
        return []


@dataclass
class Snapshot:
    """One look at the hotspot."""

    iw_available: bool
    interfaces: list[Interface]
    interface: Interface | None
    stations: dict[str, Station] = field(default_factory=dict)
    leases: dict[str, Lease] = field(default_factory=dict)
    arp: dict[str, str] = field(default_factory=dict)  # mac -> ip on the hotspot interface


def pick_interface(interfaces: list[Interface], wanted: str) -> Interface | None:
    """WANTED by name, else the first interface in AP mode."""
    if wanted:
        return next((i for i in interfaces if i.name == wanted), None)
    return next((i for i in interfaces if (i.type or "").lower() == "ap"), None)


def snapshot(wanted_iface: str, leases_dir: Path) -> Snapshot:
    dev = run_iw("dev")
    interfaces = parse_iw_dev(dev) if dev is not None else []
    iface = pick_interface(interfaces, wanted_iface)
    snap = Snapshot(iw_available=dev is not None, interfaces=interfaces, interface=iface)
    if iface is None:
        return snap
    if (iface.type or "").lower() == "ap":
        dump = run_iw("dev", iface.name, "station", "dump")
        snap.stations = parse_station_dump(dump or "")
    snap.leases = read_leases(leases_dir)
    snap.arp = {e.mac: e.ip for e in read_arp() if e.device == iface.name}
    return snap
