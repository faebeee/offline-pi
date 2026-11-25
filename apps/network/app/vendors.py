"""MAC address -> manufacturer, offline.

The IEEE registries come with Debian's ieee-data package (installed in the
image): oui.csv (MA-L, 24-bit prefixes), mam.csv (MA-M, 28-bit) and
oui36.csv (MA-S, 36-bit). Columns: Registry, Assignment (hex), Organization
Name, Organization Address.

Phones and laptops mostly join Wi-Fi with a randomized ("private") address
per network. Those have the locally administered bit set and belong to no
manufacturer, so they are reported as randomized instead of a vendor.
"""

from __future__ import annotations

import csv
import logging
from pathlib import Path

log = logging.getLogger("network.vendors")

FILES = ("oui.csv", "mam.csv", "oui36.csv")


def is_randomized(mac: str) -> bool:
    """Locally administered address (bit 1 of the first octet)."""
    try:
        return bool(int(mac[:2], 16) & 0x02)
    except ValueError:
        return False


class Vendors:
    def __init__(self, directory: Path) -> None:
        # hex prefix (6, 7 or 9 digits, upper case) -> organization
        self.prefixes: dict[str, str] = {}
        for name in FILES:
            path = directory / name
            try:
                with path.open(newline="", encoding="utf-8", errors="replace") as f:
                    for row in csv.reader(f):
                        if len(row) >= 3 and row[0] != "Registry":
                            self.prefixes[row[1].strip().upper()] = row[2].strip()
            except OSError:
                continue
        if self.prefixes:
            log.info("vendor database: %d prefixes from %s", len(self.prefixes), directory)
        else:
            log.warning("no vendor database in %s: vendors stay unknown", directory)

    def __len__(self) -> int:
        return len(self.prefixes)

    def lookup(self, mac: str) -> str | None:
        if is_randomized(mac):
            return None
        hexdigits = mac.replace(":", "").upper()
        for n in (9, 7, 6):  # most specific assignment first
            org = self.prefixes.get(hexdigits[:n])
            if org:
                return org
        return None
