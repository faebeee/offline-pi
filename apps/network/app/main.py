"""Network module: the devices on the Pi's Wi-Fi hotspot, and blocking them.

No UI here: core's network domain (/api/network/...) is the API the web app
uses. This container only reads (iw, leases, ARP) and keeps the block list;
the host helper (host/network-guard, root) enforces it.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .sources import normalize_mac, snapshot
from .store import Store
from .vendors import Vendors, is_randomized

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("network")


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    iface: str  # empty = the first interface in AP mode
    leases_dir: Path
    oui_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get("DATA_DIR", "/app/data")),
            iface=os.environ.get("NETWORK_IFACE", "").strip(),
            leases_dir=Path(os.environ.get("LEASES_DIR", "/leases")),
            oui_dir=Path(os.environ.get("OUI_DIR", "/usr/share/ieee-data")),
        )


class BlockBody(BaseModel):
    mac: str
    note: str | None = Field(default=None, max_length=100)


def _mac(value: str) -> str:
    mac = normalize_mac(value)
    if not mac:
        raise HTTPException(400, f"'{value}' is not a MAC address.")
    return mac


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings.data_dir)
    vendors = Vendors(settings.oui_dir)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        store.flush()

    app = FastAPI(title="outpost network", lifespan=lifespan)

    def enforcer_state() -> dict[str, Any]:
        e = store.enforcer()
        applied = set(e.get("macs") or []) if e else set()
        return {
            "installed": e is not None,
            "applied_at": e.get("applied_at") if e else None,
            "error": e.get("error") if e else None,
            "pending": e is None or applied != set(store.blocked),
            "applied": applied,
        }

    def client(mac: str, now: float, snap, enforced: set[str]) -> dict[str, Any]:
        st = snap.stations.get(mac)
        lease = snap.leases.get(mac)
        seen = store.seen.get(mac, {})
        blocked = store.blocked.get(mac)
        lease_live = lease is not None and (lease.expires is None or lease.expires > now)
        return {
            "mac": mac,
            "ip": snap.arp.get(mac) or (lease.ip if lease_live else None) or seen.get("ip"),
            "hostname": (lease.hostname if lease else None) or seen.get("hostname"),
            "vendor": vendors.lookup(mac),
            "randomized": is_randomized(mac),
            "connected": st is not None,
            "blocked": blocked is not None,
            "enforced": mac in enforced,
            "note": blocked.get("note") if blocked else None,
            "blocked_at": blocked.get("blocked_at") if blocked else None,
            "first_seen": seen.get("first_seen"),
            "last_seen": int(now) if st else seen.get("last_seen"),
            "lease_expires": lease.expires if lease_live else None,
            "station": {k: v for k, v in asdict(st).items() if k != "mac"} if st else None,
        }

    def clients(include: str | None = None) -> list[dict[str, Any]]:
        now = time.time()
        snap = snapshot(settings.iface, settings.leases_dir)
        store.touch(
            {
                mac: {
                    "ip": snap.arp.get(mac) or (snap.leases[mac].ip if mac in snap.leases else None),
                    "hostname": snap.leases[mac].hostname if mac in snap.leases else None,
                }
                for mac in snap.stations
            },
            now,
        )
        enforced = enforcer_state()["applied"]
        macs = set(snap.stations) | set(store.blocked) | set(store.seen) | ({include} if include else set())
        out = [client(mac, now, snap, enforced) for mac in macs]
        # online first (strongest signal first), then by last seen
        out.sort(
            key=lambda c: (
                not c["connected"],
                -((c["station"] or {}).get("signal_dbm") or -200) if c["connected"] else -(c["last_seen"] or 0),
                c["mac"],
            )
        )
        return out

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        snap = snapshot(settings.iface, settings.leases_dir)
        iface = snap.interface
        e = enforcer_state()
        e.pop("applied")
        return {
            "iw_available": snap.iw_available,
            "interface": iface.name if iface else (settings.iface or None),
            "interface_found": iface is not None,
            "mode": ((iface.type or "").lower() or None) if iface else None,
            "ssid": iface.ssid if iface else None,
            "channel": iface.channel if iface else None,
            "connected": len(snap.stations),
            "blocked": len(store.blocked),
            "vendor_prefixes": len(vendors),
            "leases_readable": settings.leases_dir.is_dir(),
            "enforcer": e,
        }

    @app.get("/api/clients")
    def list_clients() -> list[dict[str, Any]]:
        return clients()

    @app.post("/api/blocked")
    def block(body: BlockBody) -> dict[str, Any]:
        mac = _mac(body.mac)
        try:
            store.block(mac, (body.note or "").strip() or None)
        except ValueError as err:
            raise HTTPException(409, str(err)) from err
        log.info("blocked %s", mac)
        return next(c for c in clients(mac) if c["mac"] == mac)

    @app.delete("/api/blocked/{mac}")
    def unblock(mac: str) -> dict[str, Any]:
        mac = _mac(mac)
        if not store.unblock(mac):
            raise HTTPException(404, f"{mac} is not blocked.")
        log.info("unblocked %s", mac)
        return next(c for c in clients(mac) if c["mac"] == mac)

    @app.delete("/api/clients/{mac}", status_code=204)
    def forget(mac: str) -> None:
        mac = _mac(mac)
        if mac in store.blocked:
            raise HTTPException(409, "Unblock the device before forgetting it.")
        if not store.forget(mac):
            raise HTTPException(404, f"{mac} is not known.")

    return app
