"""Print all stored messages as CSV (used by `./manage.sh export`).

Reads the database directly, so it works while the app is running (WAL)."""

from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone

from .config import Settings
from .store import BROADCAST, Store


def main() -> None:
    settings = Settings.from_env()
    store = Store(settings.data_dir / "mesh.db")
    names = {n["num"]: n["long_name"] or n["node_id"] or str(n["num"]) for n in store.nodes()}
    out = csv.writer(sys.stdout)
    out.writerow(["time_utc", "direction", "conversation", "from", "to", "channel", "text", "status", "snr", "rssi", "hops"])
    for m in store.export():
        out.writerow([
            datetime.fromtimestamp(m["rx_time"], timezone.utc).isoformat(timespec="seconds"),
            m["direction"],
            m["conv"],
            names.get(m["from_num"], m["from_num"]),
            "broadcast" if m["to_num"] == BROADCAST else names.get(m["to_num"], m["to_num"]),
            m["channel"],
            m["text"],
            m["status"] or "",
            m["rx_snr"] if m["rx_snr"] is not None else "",
            m["rx_rssi"] if m["rx_rssi"] is not None else "",
            m["hops"] if m["hops"] is not None else "",
        ])
    store.close()


if __name__ == "__main__":
    main()
