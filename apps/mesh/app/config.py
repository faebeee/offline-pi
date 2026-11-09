"""Settings, read once from the environment (docker-compose.yml passes .env)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

_RATE_UNITS = {"s": 1, "sec": 1, "m": 60, "min": 60, "h": 3600, "hour": 3600}


def parse_rate(value: str) -> tuple[int, int]:
    """'5/min' -> (5, 60). An empty value or '0' disables the limit (0, 0)."""
    value = (value or "").strip().lower()
    if value in ("", "0", "off", "none"):
        return (0, 0)
    m = re.fullmatch(r"(\d+)\s*/\s*([a-z]+)", value)
    if not m or m.group(2) not in _RATE_UNITS:
        raise ValueError(f"Invalid SEND_RATE_LIMIT '{value}', expected e.g. 5/min")
    return (int(m.group(1)), _RATE_UNITS[m.group(2)])


def _port_or_off(value: str) -> str:
    """'' for 'off'/'0'/empty. compose's ${VAR:-default} turns an empty value
    back into the default, so 'off' is the way to disable it from .env."""
    value = (value or "").strip()
    return "" if value.lower() in ("", "0", "off", "none") else value


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    connection: str  # "serial" or "tcp"
    device: str
    host: str
    send_pin: str
    rate_count: int
    rate_window: int
    max_text_bytes: int
    maps_port: str
    mesh_map_port: str

    @classmethod
    def from_env(cls) -> "Settings":
        connection = os.environ.get("MESH_CONNECTION", "serial").strip().lower()
        if connection not in ("serial", "tcp"):
            raise ValueError(f"MESH_CONNECTION must be 'serial' or 'tcp', got '{connection}'")
        count, window = parse_rate(os.environ.get("SEND_RATE_LIMIT", "5/min"))
        return cls(
            data_dir=Path(os.environ.get("DATA_DIR", "/app/data")),
            connection=connection,
            device=os.environ.get("MESH_DEVICE_PATH", "/dev/meshtastic"),
            host=os.environ.get("MESH_HOST", "").strip(),
            send_pin=os.environ.get("SEND_PIN", ""),
            rate_count=count,
            rate_window=window,
            # Meshtastic's payload limit is 233 bytes; leave room for headers.
            max_text_bytes=int(os.environ.get("MAX_TEXT_BYTES", "200")),
            # Port of apps/maps on the same host, for "show on map" links; empty hides them.
            maps_port=_port_or_off(os.environ.get("MAPS_PORT", "8081")),
            # Port of apps/mesh-map: may read the node list (CORS) and is the
            # preferred "show on map" target; off disables both.
            mesh_map_port=_port_or_off(os.environ.get("MESH_MAP_PORT", "8086")),
        )
