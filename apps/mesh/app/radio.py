"""Connection to the Meshtastic node: connect, reconnect with backoff,
translate library events into store writes and live events.

The meshtastic library is thread-based (a reader thread per interface and a
publishing thread for pubsub events), so this module is too. Everything it
reports to the web side goes through `emit(kind, data)`, which main.py makes
thread-safe.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Callable

from pubsub import pub

from .config import Settings
from .store import BROADCAST, Store, conversation_key

log = logging.getLogger("mesh.radio")

Emit = Callable[[str, Any], None]

BACKOFF_MIN = 2
BACKOFF_MAX = 30

# Nodes broadcast their position rarely (firmware scales the interval up on
# busy or default channels), so a node can be heard for hours without one.
# Ask such nodes directly, sparingly: LoRa airtime is shared by everyone.
POSITION_REQUEST_GAP = 30  # seconds between two requests (any node)
POSITION_RETRY = 30 * 60  # seconds before asking the same node again
POSITION_MAX_AGE = 2 * 60 * 60  # only ask nodes heard within this many seconds
# "Request all positions" asks every node, one per tick of the connection
# loop (5 s), so a long node list doesn't flood the channel.


def camel(enum_name: str) -> str:
    """LONG_FAST -> LongFast (how Meshtastic apps name preset channels)."""
    return "".join(part.capitalize() for part in enum_name.split("_"))


def node_fields(node: dict[str, Any]) -> dict[str, Any]:
    """Map a node dict from the library's node DB onto store columns."""
    user = node.get("user") or {}
    pos = node.get("position") or {}
    metrics = node.get("deviceMetrics") or {}
    lat, lon = pos.get("latitude"), pos.get("longitude")
    if not lat and not lon:  # 0/0 means "no position"
        lat = lon = None
    voltage = metrics.get("voltage")
    return {
        "node_id": user.get("id"),
        "long_name": user.get("longName"),
        "short_name": user.get("shortName"),
        "hw_model": user.get("hwModel"),
        "role": user.get("role"),
        "last_heard": node.get("lastHeard"),
        "snr": node.get("snr"),
        "hops_away": node.get("hopsAway"),
        "battery": metrics.get("batteryLevel"),
        # rounded so voltage jitter doesn't cause a write per telemetry packet
        "voltage": round(voltage, 2) if voltage else None,
        "latitude": lat,
        "longitude": lon,
        "altitude": pos.get("altitude") if lat is not None else None,
    }


def parse_conv(conv: str) -> tuple[int, int]:
    """'ch:1' -> (BROADCAST, 1); 'dm:1234' -> (1234, 0)."""
    kind, _, value = conv.partition(":")
    if kind == "ch" and value.isdigit() and 0 <= int(value) <= 7:
        return BROADCAST, int(value)
    if kind == "dm" and value.isdigit() and 0 < int(value) < BROADCAST:
        return int(value), 0
    raise ValueError(f"Invalid conversation '{conv}'")


class RadioError(Exception):
    pass


class Radio:
    def __init__(self, settings: Settings, store: Store, emit: Emit, interface_factory=None):
        self.settings = settings
        self.store = store
        self.emit = emit
        self._factory = interface_factory or self._default_factory
        self.iface: Any = None
        self.state = "connecting"
        self.error: str | None = None
        self.my_num: int | None = None
        self.info: dict[str, Any] = {}  # last known node info, kept while disconnected
        self._stop = threading.Event()
        self._lost = threading.Event()
        # Held while sending + storing an outgoing message, and while
        # handling acks, so an ack can't arrive before its message is stored.
        self._send_lock = threading.Lock()
        self._position_asked: dict[int, float] = {}  # node num -> last request
        self._last_position_request = 0.0
        self._position_queue: list[int] = []  # nodes still to ask (request all)
        self._queue_lock = threading.Lock()
        self._thread: threading.Thread | None = None
        pub.subscribe(self._on_receive, "meshtastic.receive")
        pub.subscribe(self._on_node, "meshtastic.node.updated")
        pub.subscribe(self._on_lost, "meshtastic.connection.lost")

    # ------------------------------------------------------------ lifecycle

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="radio", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._lost.set()
        self._close()

    def _default_factory(self):
        if self.settings.connection == "tcp":
            if not self.settings.host:
                raise RadioError("MESH_CONNECTION=tcp but MESH_HOST is empty")
            from meshtastic.tcp_interface import TCPInterface

            return TCPInterface(hostname=self.settings.host)
        if not os.path.exists(self.settings.device):
            raise RadioError(f"No radio at {self.settings.device} (unplugged?)")
        from meshtastic.serial_interface import SerialInterface

        return SerialInterface(devPath=self.settings.device)

    def _run(self) -> None:
        backoff = BACKOFF_MIN
        while not self._stop.is_set():
            self._set_state("connecting")
            self._lost.clear()
            try:
                # Blocks until the node has sent its whole config and node DB.
                iface = self._factory()
            except Exception as exc:  # noqa: BLE001 - any failure means "retry later"
                log.warning("Connecting to the radio failed: %s", exc)
                self._set_state("disconnected", str(exc) or exc.__class__.__name__)
                self._stop.wait(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX)
                continue

            self.iface = iface
            try:
                self._on_connected()
            except Exception as exc:  # noqa: BLE001
                log.exception("Reading node info failed")
                self._set_state("disconnected", f"Reading node info failed: {exc}")
                self._close()
                self._stop.wait(backoff)
                continue
            backoff = BACKOFF_MIN

            # Wait until the library reports the link lost (reader thread hit
            # an I/O error), or the device node vanished (unplugged).
            while not self._stop.is_set() and not self._lost.wait(5):
                self.request_positions()
                if self.settings.connection == "serial" and not os.path.exists(self.settings.device):
                    log.warning("Radio device %s disappeared", self.settings.device)
                    break
            self._close()
            if not self._stop.is_set():
                self._set_state("disconnected", "Radio connection lost")
                self._stop.wait(BACKOFF_MIN)

    def _close(self) -> None:
        with self._queue_lock:
            self._position_queue.clear()
        iface, self.iface = self.iface, None
        if iface is not None:
            try:
                iface.close()
            except Exception:  # noqa: BLE001 - closing a dead port can throw anything
                log.debug("Error closing interface", exc_info=True)

    def _set_state(self, state: str, error: str | None = None) -> None:
        if state == self.state and error == self.error:
            return
        self.state, self.error = state, error
        self.emit("status", self.status())

    # ------------------------------------------------------------ node info

    def _on_connected(self) -> None:
        iface = self.iface
        self.my_num = iface.myInfo.my_node_num if iface.myInfo else None
        for num, node in list((iface.nodesByNum or {}).items()):
            self.store.upsert_node(num, node_fields(node))
        self.info = self._read_info(iface)
        log.info("Connected to %s (%s)", self.info.get("long_name"), self.info.get("node_id"))
        self.state, self.error = "connected", None
        self.emit("status", self.status())
        self.emit("nodes", self.store.nodes())

    def _read_info(self, iface) -> dict[str, Any]:
        from meshtastic.protobuf import channel_pb2, config_pb2

        me = (iface.nodesByNum or {}).get(self.my_num, {})
        user = me.get("user") or {}
        local = iface.localNode
        lora = local.localConfig.lora
        preset = camel(config_pb2.Config.LoRaConfig.ModemPreset.Name(lora.modem_preset)) if lora.use_preset else "Custom"
        channels = []
        for ch in local.channels or []:
            role = channel_pb2.Channel.Role.Name(ch.role)
            if role == "DISABLED":
                continue
            name = ch.settings.name or (preset if role == "PRIMARY" else f"Channel {ch.index}")
            channels.append({"index": ch.index, "name": name, "role": role.lower()})
        metadata = getattr(iface, "metadata", None)
        return {
            "node_num": self.my_num,
            "node_id": user.get("id"),
            "long_name": user.get("longName"),
            "short_name": user.get("shortName"),
            "hw_model": user.get("hwModel"),
            "firmware": metadata.firmware_version if metadata else None,
            "region": config_pb2.Config.LoRaConfig.RegionCode.Name(lora.region),
            "preset": preset,
            "channels": channels,
        }

    def status(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "error": self.error,
            "connection": self.settings.connection,
            "device": self.settings.host if self.settings.connection == "tcp" else self.settings.device,
            **self.info,
        }

    # -------------------------------------------------------------- positions

    def request_all_positions(self) -> int:
        """Queue a position request to every node but our own, most recently
        heard first; they go out one per connection-loop tick. Returns how
        many are queued (a running sweep is kept, not restarted)."""
        if self.iface is None or self.state != "connected":
            raise RadioError("Radio is not connected")
        with self._queue_lock:
            queued = set(self._position_queue)
            for node in self.store.nodes():
                if node["num"] != self.my_num and node["num"] not in queued:
                    self._position_queue.append(node["num"])
            return len(self._position_queue)

    def request_positions(self, now: float | None = None) -> int | None:
        """Ask one node for its position (the reply arrives as a normal
        POSITION_APP packet): the next one queued by request_all_positions,
        else a recently heard node without a known position. Returns the
        node num asked, or None. Called every few seconds while connected."""
        now = time.time() if now is None else now
        iface = self.iface
        if iface is None or self.state != "connected":
            return None
        with self._queue_lock:
            num = self._position_queue.pop(0) if self._position_queue else None
        if num is not None:
            self._ask_position(iface, num, now)
            return num
        if now - self._last_position_request < POSITION_REQUEST_GAP:
            return None
        for node in self.store.nodes():
            num = node["num"]
            if (
                num == self.my_num
                or node["latitude"] is not None
                or not node["last_heard"]
                or now - node["last_heard"] > POSITION_MAX_AGE
                or now - self._position_asked.get(num, 0) < POSITION_RETRY
            ):
                continue
            self._ask_position(iface, num, now)
            return num
        return None

    def _ask_position(self, iface, num: int, now: float) -> None:
        self._last_position_request = now
        self._position_asked[num] = now
        try:
            self._send_position_request(iface, num)
            log.info("Asked !%08x for its position", num)
        except Exception:  # noqa: BLE001 - a failed request is retried later
            log.warning("Position request to %s failed", num, exc_info=True)

    def _send_position_request(self, iface, num: int) -> None:
        from meshtastic.protobuf import mesh_pb2, portnums_pb2

        # Like the Meshtastic apps: send our own position (if known) and ask
        # for theirs. An empty position would overwrite ours on their side.
        pos = mesh_pb2.Position()
        own = ((iface.nodesByNum or {}).get(self.my_num) or {}).get("position") or {}
        if own.get("latitudeI") or own.get("longitudeI"):
            pos.latitude_i = own.get("latitudeI", 0)
            pos.longitude_i = own.get("longitudeI", 0)
            if own.get("altitude"):
                pos.altitude = own["altitude"]
        with self._send_lock:
            iface.sendData(
                pos, destinationId=num, portNum=portnums_pb2.PortNum.POSITION_APP,
                wantResponse=True, channelIndex=0,
            )

    # ---------------------------------------------------------------- events

    def _on_lost(self, interface=None) -> None:
        if interface is self.iface:
            self._lost.set()

    def _on_node(self, node, interface=None) -> None:
        if interface is not self.iface or not node.get("num"):
            return
        row = self.store.upsert_node(node["num"], node_fields(node))
        if row:
            self.emit("node", row)

    def _on_receive(self, packet, interface=None) -> None:
        if interface is not self.iface:
            return
        try:
            self.handle_packet(packet)
        except Exception:  # noqa: BLE001 - never kill the publishing thread
            log.exception("Failed to handle packet")

    def handle_packet(self, packet: dict[str, Any]) -> None:
        from_num = packet.get("from")
        if not from_num:
            return
        decoded = packet.get("decoded") or {}
        portnum = decoded.get("portnum")
        hops = None
        if "hopStart" in packet:
            hops = packet["hopStart"] - packet.get("hopLimit", 0)

        # The library already merged user/position/telemetry into its node
        # DB; copy that plus what this packet tells us about reception.
        if from_num != self.my_num and self.iface is not None:
            fields = node_fields((self.iface.nodesByNum or {}).get(from_num, {}))
            fields["last_heard"] = packet.get("rxTime") or int(time.time())
            if "rxSnr" in packet:
                fields["snr"] = packet["rxSnr"]
            if hops is not None:
                fields["hops_away"] = hops
            row = self.store.upsert_node(from_num, fields)
            if row:
                self.emit("node", row)

        if portnum == "TEXT_MESSAGE_APP" and decoded.get("text") is not None:
            to_num = packet.get("to", BROADCAST)
            channel = packet.get("channel", 0)
            row = self.store.add_message({
                "packet_id": packet.get("id", 0),
                "conv": conversation_key(from_num, to_num, channel, self.my_num),
                "rx_time": packet.get("rxTime") or time.time(),
                "from_num": from_num,
                "to_num": to_num,
                "channel": channel,
                "text": decoded["text"],
                "direction": "in",
                "rx_snr": packet.get("rxSnr"),
                "rx_rssi": packet.get("rxRssi"),
                "hops": hops,
            })
            if row:
                self.emit("message", row)

        elif portnum == "ROUTING_APP" and decoded.get("requestId"):
            error = (decoded.get("routing") or {}).get("errorReason", "NONE")
            if error != "NONE":
                status = "failed"
            elif from_num == self.my_num:
                # Implicit ack: our node heard a neighbour rebroadcast it.
                status = "sent"
            else:
                status = "acked"  # the destination confirmed delivery
            with self._send_lock:
                row = self.store.update_status(
                    decoded["requestId"], self.my_num or 0, status, None if error == "NONE" else error
                )
            if row:
                self.emit("message", row)

    # ---------------------------------------------------------------- sending

    def send(self, text: str, conv: str) -> dict[str, Any]:
        """Send a text message (blocking: writes to the serial port)."""
        dest, channel = parse_conv(conv)
        iface = self.iface
        if iface is None or self.state != "connected":
            raise RadioError("Radio is not connected")
        with self._send_lock:
            packet = iface.sendText(text, destinationId=dest, wantAck=True, channelIndex=channel)
            row = self.store.add_message({
                "packet_id": packet.id,
                "conv": conv,
                "rx_time": time.time(),
                "from_num": self.my_num or 0,
                "to_num": dest,
                "channel": channel,
                "text": text,
                "direction": "out",
                "status": "pending",
            })
        if row:
            self.emit("message", row)
        return row or {}
