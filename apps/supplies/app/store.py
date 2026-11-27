"""The household's supplies, in SQLite (DATA_DIR/supplies.db, SUPPLIES_DATA_DIR on the host)."""

from __future__ import annotations

import sqlite3
import threading
import time
from datetime import date
from pathlib import Path
from typing import Any

CATEGORIES = ("water", "food", "medicine", "hygiene", "power", "tools", "other")
MAX_ITEMS = 5000

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  category   TEXT    NOT NULL,
  quantity   REAL    NOT NULL DEFAULT 0,
  unit       TEXT    NOT NULL DEFAULT '',
  minimum    REAL,
  expires    TEXT,
  location   TEXT,
  note       TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""

ITEM_FIELDS = ("name", "category", "quantity", "unit", "minimum", "expires", "location", "note")

# Defaults after the Swiss emergency stockpile advice (BABS "Notvorrat"):
# water for about a week, 3 L per person and day for drinking and cooking.
DEFAULT_SETTINGS: dict[str, float] = {
    "people": 2,
    "water_litres_per_day": 3,
    "target_days": 7,
    "expiry_warning_days": 30,
}

WATER_UNITS = {"l": 1.0, "litre": 1.0, "litres": 1.0, "liter": 1.0, "ml": 0.001, "dl": 0.1, "cl": 0.01}


def litres(quantity: float, unit: str) -> float | None:
    """The quantity in litres, when the unit is a volume (water stock)."""
    f = WATER_UNITS.get(unit.strip().lower())
    return None if f is None else quantity * f


def _status(item: dict[str, Any], today: date, warn_days: int) -> dict[str, Any]:
    days_left = None
    if item["expires"]:
        try:
            days_left = (date.fromisoformat(item["expires"]) - today).days
        except ValueError:
            days_left = None
    item["days_left"] = days_left
    item["expired"] = days_left is not None and days_left < 0
    item["expiring"] = days_left is not None and 0 <= days_left <= warn_days
    item["low"] = item["minimum"] is not None and item["quantity"] < item["minimum"]
    return item


class Store:
    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(data_dir / "supplies.db", check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        # DELETE journal: WAL needs shared memory, which exFAT drives lack
        self.db.execute("PRAGMA journal_mode=DELETE")
        self.db.executescript(SCHEMA)

    # ------------------------------------------------------------ settings

    def settings(self) -> dict[str, float]:
        with self.lock:
            rows = self.db.execute("SELECT key, value FROM settings").fetchall()
        out = dict(DEFAULT_SETTINGS)
        for r in rows:
            if r["key"] in out:
                try:
                    out[r["key"]] = float(r["value"])
                except ValueError:
                    pass
        out["people"] = int(out["people"])
        out["target_days"] = int(out["target_days"])
        out["expiry_warning_days"] = int(out["expiry_warning_days"])
        return out

    def save_settings(self, changes: dict[str, float]) -> dict[str, float]:
        with self.lock:
            for k, v in changes.items():
                if k in DEFAULT_SETTINGS and v is not None:
                    self.db.execute(
                        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                        (k, str(v)),
                    )
        return self.settings()

    # --------------------------------------------------------------- items

    def items(self, today: date | None = None) -> list[dict[str, Any]]:
        today = today or date.today()
        warn = self.settings()["expiry_warning_days"]
        with self.lock:
            rows = self.db.execute("SELECT * FROM items ORDER BY category, name COLLATE NOCASE, id").fetchall()
        return [_status(dict(r), today, warn) for r in rows]

    def get(self, item_id: int, today: date | None = None) -> dict[str, Any] | None:
        with self.lock:
            r = self.db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if not r:
            return None
        return _status(dict(r), today or date.today(), self.settings()["expiry_warning_days"])

    def create(self, data: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            (count,) = self.db.execute("SELECT COUNT(*) FROM items").fetchone()
            if count >= MAX_ITEMS:
                raise ValueError(f"The list is full ({MAX_ITEMS} items).")
            cols = [k for k in ITEM_FIELDS if k in data]
            cur = self.db.execute(
                f"INSERT INTO items ({', '.join(cols)}, updated_at) VALUES ({', '.join('?' for _ in cols)}, ?)",
                (*(data[k] for k in cols), int(time.time())),
            )
            item_id = cur.lastrowid
        return self.get(item_id)  # type: ignore[arg-type,return-value]

    def update(self, item_id: int, changes: dict[str, Any]) -> dict[str, Any] | None:
        sets = {k: v for k, v in changes.items() if k in ITEM_FIELDS}
        if sets:
            cols = ", ".join(f"{k} = ?" for k in sets)
            with self.lock:
                cur = self.db.execute(
                    f"UPDATE items SET {cols}, updated_at = ? WHERE id = ?",
                    (*sets.values(), int(time.time()), item_id),
                )
                if cur.rowcount == 0:
                    return None
        return self.get(item_id)

    def adjust(self, item_id: int, delta: float) -> dict[str, Any] | None:
        """Add DELTA to the quantity (never below 0), atomically."""
        with self.lock:
            cur = self.db.execute(
                "UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = ? WHERE id = ?",
                (delta, int(time.time()), item_id),
            )
            if cur.rowcount == 0:
                return None
        return self.get(item_id)

    def delete(self, item_id: int) -> bool:
        with self.lock:
            return self.db.execute("DELETE FROM items WHERE id = ?", (item_id,)).rowcount > 0

    # -------------------------------------------------------------- summary

    def summary(self, today: date | None = None) -> dict[str, Any]:
        items = self.items(today)
        s = self.settings()
        water = sum(litres(i["quantity"], i["unit"]) or 0 for i in items if i["category"] == "water" and not i["expired"])
        per_day = s["people"] * s["water_litres_per_day"]
        water_days = water / per_day if per_day > 0 else None
        categories = {c: 0 for c in CATEGORIES}
        for i in items:
            categories[i["category"]] = categories.get(i["category"], 0) + 1
        return {
            "items": len(items),
            "expired": sum(1 for i in items if i["expired"]),
            "expiring": sum(1 for i in items if i["expiring"]),
            "low": sum(1 for i in items if i["low"]),
            "water_litres": round(water, 2),
            "water_days": None if water_days is None else round(water_days, 1),
            "categories": categories,
            "settings": s,
            "updated_at": max((i["updated_at"] for i in items), default=None),
        }
