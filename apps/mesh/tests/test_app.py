"""End-to-end tests with a fake Meshtastic interface (no radio needed).

Run: python -m pytest tests (from apps/mesh, with requirements-dev.txt)."""

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from meshtastic.protobuf import channel_pb2, config_pb2, localonly_pb2

from app.config import Settings, parse_rate
from app.main import create_app
from app.store import BROADCAST

MY = 0x11111111
OTHER = 0x22222222


class FakeInterface:
    def __init__(self):
        self.myInfo = SimpleNamespace(my_node_num=MY)
        self.metadata = SimpleNamespace(firmware_version="2.7.0.test")
        self.nodesByNum = {
            MY: {"num": MY, "user": {"id": "!11111111", "longName": "Pi Base", "shortName": "PI"}},
            OTHER: {
                "num": OTHER,
                "user": {"id": "!22222222", "longName": "Anna", "shortName": "ANNA", "hwModel": "T_ECHO"},
                "position": {"latitude": 47.37, "longitude": 8.54},
                "deviceMetrics": {"batteryLevel": 80, "voltage": 3.912},
                "lastHeard": 1000,
            },
        }
        lc = localonly_pb2.LocalConfig()
        lc.lora.use_preset = True
        lc.lora.modem_preset = config_pb2.Config.LoRaConfig.ModemPreset.LONG_FAST
        lc.lora.region = config_pb2.Config.LoRaConfig.RegionCode.EU_868
        primary = channel_pb2.Channel(index=0, role=channel_pb2.Channel.Role.PRIMARY)
        family = channel_pb2.Channel(index=1, role=channel_pb2.Channel.Role.SECONDARY)
        family.settings.name = "Family"
        off = channel_pb2.Channel(index=2, role=channel_pb2.Channel.Role.DISABLED)
        self.localNode = SimpleNamespace(localConfig=lc, channels=[primary, family, off])
        self.sent = []
        self.closed = False
        self._next_id = 500

    def sendText(self, text, destinationId, wantAck, channelIndex):
        self._next_id += 1
        self.sent.append((text, destinationId, wantAck, channelIndex))
        return SimpleNamespace(id=self._next_id)

    def close(self):
        self.closed = True


def wait_for(cond, timeout=3.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    raise AssertionError("condition not met in time")


def make_settings(tmp_path, **kw):
    base = dict(
        data_dir=tmp_path, connection="serial", device="/dev/null", host="", send_pin="",
        rate_count=0, rate_window=0, max_text_bytes=200, maps_port="8081", mesh_map_port="8086",
    )
    base.update(kw)
    return Settings(**base)


@pytest.fixture
def setup(tmp_path):
    fakes = []

    def factory():
        fakes.append(FakeInterface())
        return fakes[-1]

    app = create_app(make_settings(tmp_path), interface_factory=factory)
    with TestClient(app) as client:
        radio = app.state.radio
        wait_for(lambda: radio.state == "connected")
        yield client, radio, fakes


def text_packet(pid, text, to=BROADCAST, channel=0, frm=OTHER):
    pkt = {"from": frm, "to": to, "id": pid, "rxTime": 2000, "rxSnr": 6.5, "rxRssi": -90,
           "hopStart": 3, "hopLimit": 2, "decoded": {"portnum": "TEXT_MESSAGE_APP", "text": text}}
    if channel:
        pkt["channel"] = channel
    return pkt


def test_parse_rate():
    assert parse_rate("5/min") == (5, 60)
    assert parse_rate("") == (0, 0)
    with pytest.raises(ValueError):
        parse_rate("five")


def test_status_and_nodes(setup):
    client, _, _ = setup
    s = client.get("/api/status").json()
    assert s["state"] == "connected"
    assert s["long_name"] == "Pi Base"
    assert s["region"] == "EU_868"
    assert s["channels"] == [
        {"index": 0, "name": "LongFast", "role": "primary"},
        {"index": 1, "name": "Family", "role": "secondary"},
    ]
    nodes = {n["num"]: n for n in client.get("/api/nodes").json()}
    assert nodes[OTHER]["long_name"] == "Anna"
    assert nodes[OTHER]["battery"] == 80
    assert nodes[OTHER]["voltage"] == 3.91


def test_receive_dedupe_and_dm(setup):
    client, radio, _ = setup
    radio.handle_packet(text_packet(1, "hello all"))
    radio.handle_packet(text_packet(1, "hello all"))  # heard twice
    radio.handle_packet(text_packet(2, "family only", channel=1))
    radio.handle_packet(text_packet(3, "just you", to=MY))
    ch0 = client.get("/api/messages", params={"conv": "ch:0"}).json()
    assert [m["text"] for m in ch0] == ["hello all"]
    assert ch0[0]["hops"] == 1
    assert [m["text"] for m in client.get("/api/messages", params={"conv": "ch:1"}).json()] == ["family only"]
    assert [m["text"] for m in client.get("/api/messages", params={"conv": f"dm:{OTHER}"}).json()] == ["just you"]
    convs = {c["conv"] for c in client.get("/api/conversations").json()}
    assert convs == {"ch:0", "ch:1", f"dm:{OTHER}"}


def test_send_and_acks(setup):
    client, radio, fakes = setup
    r = client.post("/api/messages", json={"conv": f"dm:{OTHER}", "text": "  hi Anna "})
    assert r.status_code == 201, r.text
    msg = r.json()
    assert msg["status"] == "pending" and msg["text"] == "hi Anna"
    assert fakes[-1].sent == [("hi Anna", OTHER, True, 0)]

    def ack(frm, err="NONE"):
        radio.handle_packet({"from": frm, "to": MY, "id": 9000 + frm % 7,
                             "decoded": {"portnum": "ROUTING_APP", "requestId": msg["packet_id"],
                                         "routing": {"errorReason": err}}})

    def status():
        return client.get("/api/messages", params={"conv": f"dm:{OTHER}"}).json()[-1]["status"]

    ack(MY)
    assert status() == "sent"
    ack(OTHER)
    assert status() == "acked"
    ack(MY)  # late implicit ack must not downgrade
    assert status() == "acked"

    r = client.post("/api/messages", json={"conv": "ch:1", "text": "to family"})
    assert fakes[-1].sent[-1] == ("to family", BROADCAST, True, 1)


def test_send_validation(setup):
    client, _, _ = setup
    assert client.post("/api/messages", json={"conv": "ch:0", "text": "   "}).status_code == 400
    assert client.post("/api/messages", json={"conv": "ch:0", "text": "ü" * 101}).status_code == 400  # 202 bytes
    assert client.post("/api/messages", json={"conv": "ch:9", "text": "x"}).status_code == 400
    assert client.post("/api/messages", json={"conv": "dm:0", "text": "x"}).status_code == 400


def test_pin_and_rate_limit(tmp_path):
    app = create_app(make_settings(tmp_path, send_pin="1234", rate_count=2, rate_window=60),
                     interface_factory=FakeInterface)
    with TestClient(app) as client:
        wait_for(lambda: app.state.radio.state == "connected")
        body = {"conv": "ch:0", "text": "x"}
        assert client.get("/api/status").json()["config"]["send_pin_required"] is True
        assert client.post("/api/messages", json=body).status_code == 401
        assert client.post("/api/messages", json=body, headers={"X-Send-Pin": "0000"}).status_code == 401
        ok = {"X-Send-Pin": "1234"}
        assert client.post("/api/messages", json=body, headers=ok).status_code == 201
        assert client.post("/api/messages", json=body, headers=ok).status_code == 201
        assert client.post("/api/messages", json=body, headers=ok).status_code == 429


def test_reconnect_after_loss(setup):
    client, radio, fakes = setup
    first = fakes[-1]
    radio._on_lost(interface=first)
    wait_for(lambda: first.closed)
    wait_for(lambda: len(fakes) == 2 and radio.state == "connected", timeout=6)
    assert client.get("/api/status").json()["state"] == "connected"


def test_unplugged_radio_reports_disconnected(tmp_path):
    settings = make_settings(tmp_path, device=str(tmp_path / "missing"))
    app = create_app(settings)
    with TestClient(app) as client:
        wait_for(lambda: app.state.radio.state == "disconnected")
        s = client.get("/api/status").json()
        assert s["state"] == "disconnected" and "unplugged" in s["error"]
        assert client.post("/api/messages", json={"conv": "ch:0", "text": "x"}).status_code == 503
        # history and UI still served
        assert client.get("/api/messages", params={"conv": "ch:0"}).status_code == 200


def test_websocket_pushes_messages(setup):
    client, radio, _ = setup
    with client.websocket_connect("/api/live") as ws:
        assert ws.receive_json()["type"] == "status"
        radio.handle_packet(text_packet(77, "live!"))
        while True:
            evt = ws.receive_json()
            if evt["type"] == "message":
                break
        assert evt["data"]["text"] == "live!"


def test_persists_across_restart(tmp_path):
    for i in range(2):
        app = create_app(make_settings(tmp_path), interface_factory=FakeInterface)
        with TestClient(app) as client:
            wait_for(lambda: app.state.radio.state == "connected")
            if i == 0:
                app.state.radio.handle_packet(text_packet(5, "keep me"))
            else:
                msgs = client.get("/api/messages", params={"conv": "ch:0"}).json()
                assert [m["text"] for m in msgs] == ["keep me"]


def test_mesh_map_origin_may_read_nodes(setup):
    client, _, _ = setup
    page = {"Origin": "http://pi.local:8086", "Host": "pi.local:8084"}
    r = client.get("/api/nodes", headers=page)
    assert r.headers["access-control-allow-origin"] == "http://pi.local:8086"
    assert client.get("/api/status", headers=page).headers["access-control-allow-origin"] == "http://pi.local:8086"
    # other hosts, other ports (apps/maps included) and other endpoints get no CORS header
    for headers, path in [
        ({"Origin": "http://evil.example:8086", "Host": "pi.local:8084"}, "/api/nodes"),
        ({"Origin": "http://pi.local:8081", "Host": "pi.local:8084"}, "/api/nodes"),
        (page, "/api/conversations"),
    ]:
        assert "access-control-allow-origin" not in client.get(path, headers=headers).headers


def test_ports_off(tmp_path, monkeypatch):
    monkeypatch.setenv("MAPS_PORT", "off")
    monkeypatch.setenv("MESH_MAP_PORT", "0")
    s = Settings.from_env()
    assert s.maps_port == "" and s.mesh_map_port == ""
