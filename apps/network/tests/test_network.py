from pathlib import Path

from fastapi.testclient import TestClient

from app import main as main_mod
from app import sources
from app.main import Settings, create_app
from app.sources import normalize_mac, parse_arp, parse_iw_dev, parse_leases, parse_station_dump
from app.vendors import Vendors, is_randomized

IW_DEV = """phy#0
\tUnnamed/non-netdev interface
\t\twdev 0x2
\tInterface wlan0
\t\tifindex 3
\t\twdev 0x1
\t\taddr dc:a6:32:00:00:01
\t\tssid Basecamp-1
\t\ttype AP
\t\tchannel 6 (2437 MHz), width: 20 MHz, center1: 2437 MHz
\t\ttxpower 31.00 dBm
"""

STATIONS = """Station 12:34:56:78:9a:bc (on wlan0)
\tinactive time:\t304 ms
\trx bytes:\t18816
\ttx bytes:\t5016
\tsignal:  \t-34 [-34] dBm
\tsignal avg:\t-35 dBm
\ttx bitrate:\t65.0 MBit/s MCS 7
\trx bitrate:\t54.0 MBit/s
\tauthorized:\tyes
\tconnected time:\t137 seconds
Station b8:27:eb:11:22:33 (on wlan0)
\tsignal:  \t-71 dBm
"""

LEASES = """1999999999 12:34:56:78:9a:bc 10.42.0.23 pixel-7 01:12:34:56:78:9a:bc
0 b8:27:eb:11:22:33 10.42.0.50 * *
"""

ARP = """IP address       HW type     Flags       HW address            Mask     Device
10.42.0.23       0x1         0x2         12:34:56:78:9a:bc     *        wlan0
10.42.0.99       0x1         0x0         00:00:00:00:00:00     *        wlan0
192.168.1.1      0x1         0x2         aa:aa:aa:aa:aa:aa     *        eth0
"""


def test_normalize_mac():
    assert normalize_mac("AA-BB-CC-DD-EE-FF") == "aa:bb:cc:dd:ee:ff"
    assert normalize_mac("aabb.ccdd.eeff") == "aa:bb:cc:dd:ee:ff"
    assert normalize_mac("aa:bb:cc:dd:ee") is None
    assert normalize_mac("aa:bb:cc:dd:ee:fg") is None
    assert normalize_mac("aa:bb:cc:dd:ee:ff; rm -rf /") is None


def test_parsers():
    (iface,) = parse_iw_dev(IW_DEV)
    assert (iface.name, iface.type, iface.ssid, iface.channel) == ("wlan0", "AP", "Basecamp-1", 6)
    st = parse_station_dump(STATIONS)
    a = st["12:34:56:78:9a:bc"]
    assert (a.signal_dbm, a.signal_avg_dbm, a.connected_seconds, a.inactive_ms) == (-34, -35, 137, 304)
    assert (a.rx_bytes, a.tx_bytes, a.tx_bitrate, a.authorized) == (18816, 5016, "65 Mbit/s", True)
    assert st["b8:27:eb:11:22:33"].signal_dbm == -71
    leases = parse_leases(LEASES)
    assert leases["12:34:56:78:9a:bc"].hostname == "pixel-7"
    assert leases["b8:27:eb:11:22:33"].hostname is None
    assert leases["b8:27:eb:11:22:33"].expires is None
    arp = parse_arp(ARP)
    assert [(e.mac, e.device) for e in arp] == [("12:34:56:78:9a:bc", "wlan0"), ("aa:aa:aa:aa:aa:aa", "eth0")]


def test_vendors(tmp_path: Path):
    (tmp_path / "oui.csv").write_text(
        "Registry,Assignment,Organization Name,Organization Address\n"
        'MA-L,B827EB,Raspberry Pi Foundation,"Mitchell Wood House Caldecote GB"\n'
    )
    (tmp_path / "mam.csv").write_text("Registry,Assignment,Organization Name,Organization Address\nMA-M,B827EB1,Tiny Co,x\n")
    v = Vendors(tmp_path)
    assert v.lookup("b8:27:eb:11:22:33") == "Tiny Co"  # MA-M beats MA-L
    assert v.lookup("b8:27:eb:22:22:33") == "Raspberry Pi Foundation"
    assert is_randomized("12:34:56:78:9a:bc") and v.lookup("12:34:56:78:9a:bc") is None
    assert not is_randomized("b8:27:eb:11:22:33")


def make_client(tmp_path: Path, monkeypatch) -> TestClient:
    leases = tmp_path / "leases"
    leases.mkdir()
    (leases / "dnsmasq-wlan0.leases").write_text(LEASES)
    arp = tmp_path / "arp"
    arp.write_text(ARP)

    def fake_iw(*args):
        return IW_DEV if args == ("dev",) else STATIONS

    monkeypatch.setattr(sources, "run_iw", fake_iw)
    monkeypatch.setattr(sources, "read_arp", lambda path=arp: parse_arp(arp.read_text()))
    s = Settings(data_dir=tmp_path / "data", iface="", leases_dir=leases, oui_dir=tmp_path)
    return TestClient(main_mod.create_app(s))


def test_api_block_flow(tmp_path: Path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    status = c.get("/api/status").json()
    assert status["interface"] == "wlan0" and status["mode"] == "ap" and status["connected"] == 2
    assert status["enforcer"] == {"installed": False, "applied_at": None, "error": None, "pending": True}
    assert status["hotspot"]["active"] and not status["hotspot"]["helper"]

    clients = c.get("/api/clients").json()
    assert [x["mac"] for x in clients] == ["12:34:56:78:9a:bc", "b8:27:eb:11:22:33"]  # by signal
    first = clients[0]
    assert first["ip"] == "10.42.0.23" and first["hostname"] == "pixel-7" and first["randomized"]
    assert first["station"]["signal_dbm"] == -34

    assert c.post("/api/blocked", json={"mac": "nope"}).status_code == 400
    r = c.post("/api/blocked", json={"mac": "B8-27-EB-11-22-33", "note": "unknown"})
    assert r.status_code == 200 and r.json()["blocked"] and r.json()["note"] == "unknown"
    assert (tmp_path / "data" / "blocked.macs").read_text() == "b8:27:eb:11:22:33\n"

    # the host helper reports back
    (tmp_path / "data" / "enforcer.json").write_text('{"applied_at": 1, "macs": ["b8:27:eb:11:22:33"], "error": null}')
    assert c.get("/api/status").json()["enforcer"]["pending"] is False
    assert next(x for x in c.get("/api/clients").json() if x["blocked"])["enforced"]

    # a device that was never seen can be blocked and unblocked
    assert c.post("/api/blocked", json={"mac": "02:00:00:00:00:01"}).json()["connected"] is False
    assert c.delete("/api/blocked/02:00:00:00:00:01").json()["blocked"] is False

    assert c.delete("/api/clients/b8:27:eb:11:22:33").status_code == 409
    assert c.delete("/api/blocked/b8:27:eb:11:22:33").status_code == 200
    assert (tmp_path / "data" / "blocked.macs").read_text() == ""
    assert c.delete("/api/blocked/b8:27:eb:11:22:33").status_code == 404


def test_api_hotspot_switch(tmp_path: Path, monkeypatch):
    c = make_client(tmp_path, monkeypatch)
    data = tmp_path / "data"
    # without the host helper the switch is refused
    assert c.post("/api/hotspot", json={"on": False}).status_code == 409
    assert not (data / "hotspot.request").exists()

    (data / "hotspot.json").write_text('{"applied_at": 1, "request": null, "connection": "pi-hotspot", "error": null}')
    h = c.post("/api/hotspot", json={"on": False}).json()
    assert (data / "hotspot.request").read_text() == "off\n"
    assert h["requested"] == "off" and h["pending"] and h["helper"]

    # the helper reports back
    (data / "hotspot.json").write_text('{"applied_at": 9999999999, "request": "off", "error": "nope"}')
    h = c.get("/api/status").json()["hotspot"]
    assert not h["pending"] and h["error"] == "nope"
    assert c.post("/api/hotspot", json={"on": "maybe"}).status_code == 422
