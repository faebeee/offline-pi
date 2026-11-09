"""SQLite persistence for messages and nodes.

Writes only happen on new packets (and node changes), so the database is
SD-card friendly. One connection, guarded by a lock: callers are the radio's
background thread and the asyncio request handlers.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

BROADCAST = 0xFFFFFFFF

# Each entry migrates from user_version == index to index + 1.
MIGRATIONS = [
    """
    CREATE TABLE messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      packet_id  INTEGER NOT NULL,
      conv       TEXT    NOT NULL,      -- 'ch:<index>' or 'dm:<node num>'
      rx_time    REAL    NOT NULL,      -- unix seconds
      from_num   INTEGER NOT NULL,
      to_num     INTEGER NOT NULL,
      channel    INTEGER NOT NULL DEFAULT 0,
      text       TEXT    NOT NULL,
      direction  TEXT    NOT NULL,      -- 'in' or 'out'
      status     TEXT,                  -- out: pending|sent|acked|failed; in: NULL
      error      TEXT,
      rx_snr     REAL,
      rx_rssi    INTEGER,
      hops       INTEGER
    );
    CREATE UNIQUE INDEX messages_packet ON messages (from_num, packet_id);
    CREATE INDEX messages_conv ON messages (conv, id);

    CREATE TABLE nodes (
      num         INTEGER PRIMARY KEY,
      node_id     TEXT,
      long_name   TEXT,
      short_name  TEXT,
      hw_model    TEXT,
      role        TEXT,
      last_heard  REAL,
      snr         REAL,
      hops_away   INTEGER,
      battery     INTEGER,
      voltage     REAL,
      latitude    REAL,
      longitude   REAL,
      altitude    INTEGER
    );
    """,
]

NODE_FIELDS = (
    "node_id", "long_name", "short_name", "hw_model", "role", "last_heard", "snr",
    "hops_away", "battery", "voltage", "latitude", "longitude", "altitude",
)


def conversation_key(from_num: int, to_num: int, channel: int, my_num: int | None) -> str:
    """Broadcasts belong to their channel, direct messages to the other node."""
    if to_num == BROADCAST:
        return f"ch:{channel}"
    other = to_num if from_num == my_num else from_num
    return f"dm:{other}"


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            # WAL: readers don't block the writer; NORMAL sync is safe with WAL
            # and avoids an fsync per message on the SD card.
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.execute("PRAGMA synchronous=NORMAL")
            self._migrate()

    def _migrate(self) -> None:
        version = self._db.execute("PRAGMA user_version").fetchone()[0]
        for target in range(version, len(MIGRATIONS)):
            self._db.executescript(f"BEGIN; {MIGRATIONS[target]} PRAGMA user_version = {target + 1}; COMMIT;")

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # -------------------------------------------------------------- messages

    def add_message(self, msg: dict[str, Any]) -> dict[str, Any] | None:
        """Insert a message; returns it with its row id, or None if it is a
        duplicate (same sender + packet id, e.g. heard twice via the mesh)."""
        cols = ("packet_id", "conv", "rx_time", "from_num", "to_num", "channel", "text",
                "direction", "status", "error", "rx_snr", "rx_rssi", "hops")
        values = [msg.get(c) for c in cols]
        with self._lock:
            cur = self._db.execute(
                f"INSERT OR IGNORE INTO messages ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                values,
            )
            if cur.rowcount == 0:
                return None
            row = self._db.execute("SELECT * FROM messages WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)

    def update_status(self, packet_id: int, from_num: int, status: str, error: str | None = None) -> dict[str, Any] | None:
        """Set the delivery state of one of our outgoing messages. Never
        downgrades: 'acked' stays acked when a late implicit ack arrives."""
        rank = {"pending": 0, "sent": 1, "failed": 2, "acked": 3}
        with self._lock:
            row = self._db.execute(
                "SELECT * FROM messages WHERE packet_id = ? AND from_num = ? AND direction = 'out'",
                (packet_id, from_num),
            ).fetchone()
            if row is None or rank.get(row["status"] or "pending", 0) >= rank[status]:
                return None
            self._db.execute(
                "UPDATE messages SET status = ?, error = ? WHERE id = ?", (status, error, row["id"])
            )
            row = self._db.execute("SELECT * FROM messages WHERE id = ?", (row["id"],)).fetchone()
        return dict(row)

    def fail_stale(self, older_than: float) -> list[dict[str, Any]]:
        """Pending messages that never got any ack (radio unplugged, reboot)."""
        with self._lock:
            rows = self._db.execute(
                "SELECT id FROM messages WHERE direction = 'out' AND status = 'pending' AND rx_time < ?",
                (older_than,),
            ).fetchall()
            ids = [r["id"] for r in rows]
            if not ids:
                return []
            marks = ",".join("?" * len(ids))
            self._db.execute(
                f"UPDATE messages SET status = 'failed', error = 'NO_ACK' WHERE id IN ({marks})", ids
            )
            rows = self._db.execute(f"SELECT * FROM messages WHERE id IN ({marks})", ids).fetchall()
        return [dict(r) for r in rows]

    def messages(self, conv: str, before: int | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Newest `limit` messages of a conversation older than row id
        `before`, returned oldest first."""
        sql = "SELECT * FROM messages WHERE conv = ?"
        args: list[Any] = [conv]
        if before:
            sql += " AND id < ?"
            args.append(before)
        sql += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            rows = self._db.execute(sql, args).fetchall()
        return [dict(r) for r in reversed(rows)]

    def conversations(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                """SELECT conv, COUNT(*) AS count, MAX(id) AS last_id, MAX(rx_time) AS last_time
                   FROM messages GROUP BY conv ORDER BY last_time DESC"""
            ).fetchall()
        return [dict(r) for r in rows]

    def export(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute("SELECT * FROM messages ORDER BY id").fetchall()
        return [dict(r) for r in rows]

    # ----------------------------------------------------------------- nodes

    def upsert_node(self, num: int, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Merge non-None fields into the node row. Returns the row if
        anything changed, None otherwise (so unchanged telemetry costs no
        write and no websocket push)."""
        fields = {k: v for k, v in fields.items() if k in NODE_FIELDS and v is not None}
        with self._lock:
            row = self._db.execute("SELECT * FROM nodes WHERE num = ?", (num,)).fetchone()
            if row is None:
                cols = ["num", *fields]
                self._db.execute(
                    f"INSERT INTO nodes ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    [num, *fields.values()],
                )
            else:
                changed = {k: v for k, v in fields.items() if row[k] != v}
                if not changed:
                    return None
                sets = ", ".join(f"{k} = ?" for k in changed)
                self._db.execute(f"UPDATE nodes SET {sets} WHERE num = ?", [*changed.values(), num])
            row = self._db.execute("SELECT * FROM nodes WHERE num = ?", (num,)).fetchone()
        return dict(row)

    def nodes(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._db.execute(
                "SELECT * FROM nodes ORDER BY last_heard IS NULL, last_heard DESC"
            ).fetchall()
        return [dict(r) for r in rows]

    def node(self, num: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM nodes WHERE num = ?", (num,)).fetchone()
        return dict(row) if row else None


def now() -> float:
    return time.time()
