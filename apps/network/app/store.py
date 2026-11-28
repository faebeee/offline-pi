"""What the module keeps in DATA_DIR (NETWORK_DATA_DIR on the host).

- blocked.json: the block list with a note and the time, for the screen.
- blocked.macs: the same MACs, one per line, for the host helper
  (host/network-guard), which watches this file and turns it into a
  firewall rule. Both are written atomically (temp file + rename).
- seen.json: devices seen on the hotspot (first/last seen, IP, hostname),
  so a device stays inspectable after it left. Kept for HISTORY_DAYS.
- enforcer.json: written by the host helper (as root) after it applied
  blocked.macs: when, which MACs, and an error if it failed. Read only here.
- hotspot.request: "on", "on IFACE" or "off", the hotspot switch
  (written by install.sh or ./manage.sh network hotspot); the host helper
  (outpost-network-hotspot.path) applies it when the file changes.
- hotspot.json: written by the host helper after it switched the hotspot
  (or once at install): when, what, and an error if it failed. Read only.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

log = logging.getLogger("network.store")

HISTORY_DAYS = 30
SAVE_EVERY = 60  # seconds between writes of seen.json while devices are online
MAX_BLOCKED = 1000  # the host helper ignores anything beyond this


def _write_atomic(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return default
    except (OSError, ValueError) as err:
        log.warning("ignoring unreadable %s: %s", path, err)
        return default


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.dir = data_dir
        self.dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.blocked: dict[str, dict[str, Any]] = _read_json(self.dir / "blocked.json", {})
        self.seen: dict[str, dict[str, Any]] = _read_json(self.dir / "seen.json", {})
        self._seen_saved = 0.0
        # the helper's file must match the list, e.g. after a restore
        self._write_macs()

    # ------------------------------------------------------------ blocking

    def block(self, mac: str, note: str | None) -> dict[str, Any]:
        with self.lock:
            if mac not in self.blocked and len(self.blocked) >= MAX_BLOCKED:
                raise ValueError(f"At most {MAX_BLOCKED} devices can be blocked.")
            entry = {"note": note or None, "blocked_at": int(time.time())}
            if mac in self.blocked and note is None:
                entry["note"] = self.blocked[mac].get("note")
            self.blocked[mac] = entry
            self._save_blocked()
            return entry

    def unblock(self, mac: str) -> bool:
        with self.lock:
            if self.blocked.pop(mac, None) is None:
                return False
            self._save_blocked()
            return True

    def _save_blocked(self) -> None:
        _write_atomic(self.dir / "blocked.json", json.dumps(self.blocked, indent=1, sort_keys=True))
        self._write_macs()

    def _write_macs(self) -> None:
        text = "".join(f"{mac}\n" for mac in sorted(self.blocked))
        path = self.dir / "blocked.macs"
        try:
            if path.read_text() == text:
                return  # unchanged: don't wake the host helper
        except OSError:
            pass
        _write_atomic(path, text)

    def enforcer(self) -> dict[str, Any] | None:
        data = _read_json(self.dir / "enforcer.json", None)
        return data if isinstance(data, dict) else None

    # ------------------------------------------------------------- hotspot

    def request_hotspot(self, on: bool) -> None:
        """Always rewritten, so asking again retries a failed switch."""
        _write_atomic(self.dir / "hotspot.request", "on\n" if on else "off\n")

    def hotspot_request(self) -> tuple[str | None, int | None]:
        """The last request ("on"/"off") and when it was made (unix seconds)."""
        path = self.dir / "hotspot.request"
        try:
            # "on", "off" or "on IFACE" (install.sh picks the interface)
            words = path.read_text().split()
            text = words[0] if words else ""
            return (text if text in ("on", "off") else None), int(path.stat().st_mtime)
        except OSError:
            return None, None

    def hotspot_helper(self) -> dict[str, Any] | None:
        data = _read_json(self.dir / "hotspot.json", None)
        return data if isinstance(data, dict) else None

    # ------------------------------------------------------------- history

    def touch(self, devices: dict[str, dict[str, Any]], now: float) -> None:
        """Record DEVICES (mac -> ip/hostname) as seen NOW."""
        with self.lock:
            for mac, info in devices.items():
                entry = self.seen.setdefault(mac, {"first_seen": int(now)})
                entry["last_seen"] = int(now)
                for key in ("ip", "hostname"):
                    if info.get(key):
                        entry[key] = info[key]
            if devices and now - self._seen_saved >= SAVE_EVERY:
                self._save_seen(now)

    def _save_seen(self, now: float) -> None:
        cutoff = now - HISTORY_DAYS * 86400
        self.seen = {
            mac: e for mac, e in self.seen.items() if e.get("last_seen", 0) >= cutoff or mac in self.blocked
        }
        try:
            _write_atomic(self.dir / "seen.json", json.dumps(self.seen, indent=1, sort_keys=True))
            self._seen_saved = now
        except OSError as err:
            log.warning("could not save seen.json: %s", err)

    def forget(self, mac: str) -> bool:
        with self.lock:
            if self.seen.pop(mac, None) is None:
                return False
            self._save_seen(time.time())
            return True

    def flush(self) -> None:
        with self.lock:
            self._save_seen(time.time())
