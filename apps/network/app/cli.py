"""./manage.sh network ...: talks to the running container's own API.

  python -m app.cli status | clients | block MAC [NOTE] | unblock MAC | hotspot on|off
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = f"http://127.0.0.1:{os.environ.get('PORT', '8085')}"


def call(method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as err:
        try:
            detail = json.loads(err.read().decode()).get("detail")
        except ValueError:
            detail = None
        sys.exit(f"error: {detail or err}")


def ago(ts: int | None) -> str:
    if not ts:
        return "-"
    s = int(time.time() - ts)
    for unit, n in (("d", 86400), ("h", 3600), ("m", 60)):
        if s >= n:
            return f"{s // n}{unit} ago"
    return "now"


def status() -> None:
    s = call("GET", "/api/status")
    e = s["enforcer"]
    if not s["iw_available"]:
        print("Wi-Fi:      iw not available (no Wi-Fi on this host?)")
    elif not s["interface_found"]:
        print(f"Wi-Fi:      no hotspot interface{' ' + s['interface'] if s['interface'] else ''} found")
    else:
        print(f"Interface:  {s['interface']} ({s['mode']}){' · ' + s['ssid'] if s['ssid'] else ''}")
    print(f"Connected:  {s['connected']}")
    print(f"Blocked:    {s['blocked']}")
    print(f"Vendors:    {s['vendor_prefixes']} prefixes")
    if not e["installed"]:
        print("Blocking:   host helper not installed (sudo host/network-guard/install-network-guard.sh)")
    else:
        state = "error: " + e["error"] if e["error"] else ("pending" if e["pending"] else "enforced")
        print(f"Blocking:   {state}, applied {ago(e['applied_at'])}")
    h = s["hotspot"]
    if not h["helper"]:
        print("Hotspot:    switch not installed (./manage.sh network install-guard)")
    else:
        state = "on" if h["active"] else "off"
        if h["pending"]:
            state += f", switching {h['requested']}"
        elif h["error"]:
            state += ", last switch failed: " + h["error"]
        print(f"Hotspot:    {state}")


def clients() -> None:
    rows = call("GET", "/api/clients")
    if not rows:
        print("No devices seen yet.")
        return
    print(f"{'MAC':17}  {'STATE':9}  {'IP':15}  {'SIGNAL':7}  {'NAME':20}  VENDOR")
    for c in rows:
        state = "blocked" if c["blocked"] else ("online" if c["connected"] else ago(c["last_seen"]))
        sig = c["station"] and c["station"]["signal_dbm"]
        vendor = "randomized" if c["randomized"] else (c["vendor"] or "-")
        print(
            f"{c['mac']:17}  {state:9}  {c['ip'] or '-':15}  {(str(sig) + ' dBm') if sig else '-':7}  "
            f"{(c['hostname'] or '-')[:20]:20}  {vendor}"
        )


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else ""
    if cmd == "status":
        status()
    elif cmd == "clients":
        clients()
    elif cmd == "block" and len(argv) >= 2:
        c = call("POST", "/api/blocked", {"mac": argv[1], "note": " ".join(argv[2:]) or None})
        print(f"Blocked {c['mac']}.")
    elif cmd == "unblock" and len(argv) == 2:
        c = call("DELETE", f"/api/blocked/{argv[1]}")
        print(f"Unblocked {c['mac']}.")
    elif cmd == "hotspot" and len(argv) == 2 and argv[1] in ("on", "off"):
        call("POST", "/api/hotspot", {"on": argv[1] == "on"})
        print(f"Hotspot {argv[1]} requested; the host helper switches it in a few seconds.")
    else:
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
