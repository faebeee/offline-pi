#!/usr/bin/env bash
#
# install-network-guard.sh
#
# Installs the host helper that enforces the block list of outpost's
# Network module (see outpost-network-guard.sh): the script, a oneshot
# service (also run at boot) and a path unit that runs it whenever the
# module changes <NETWORK_DATA_DIR>/blocked.macs. Also installs the hotspot
# switch (outpost-network-hotspot.sh, a service and a path unit on
# <NETWORK_DATA_DIR>/hotspot.request). Installs nftables (the
# `nft` command only; nftables.service stays off, its default config would
# flush NetworkManager's hotspot rules) and iw if missing.
#
# Re-run it after moving NETWORK_DATA_DIR (./install.sh offers that).
#
# Usage: sudo ./install-network-guard.sh [--data-dir DIR]
#
#   --data-dir DIR   the Network module's data folder (default:
#                    NETWORK_DATA_DIR from the outpost .env, else
#                    <outpost>/data/network)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPOST_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BIN_PATH="/usr/local/bin/outpost-network-guard.sh"
ENV_PATH="/etc/outpost-network-guard.env"
SERVICE_PATH="/etc/systemd/system/outpost-network-guard.service"
PATH_UNIT_PATH="/etc/systemd/system/outpost-network-guard.path"
HOTSPOT_BIN_PATH="/usr/local/bin/outpost-network-hotspot.sh"
HOTSPOT_SERVICE_PATH="/etc/systemd/system/outpost-network-hotspot.service"
HOTSPOT_PATH_UNIT_PATH="/etc/systemd/system/outpost-network-hotspot.path"

usage() { echo "Usage: sudo $0 [--data-dir DIR]"; }

DATA_DIR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --data-dir)
            [[ $# -ge 2 && -n "$2" ]] || { usage >&2; exit 1; }
            DATA_DIR="$2"; shift 2 ;;
        --data-dir=*) DATA_DIR="${1#--data-dir=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    echo "Please run this installer as root (e.g. sudo $0)" >&2
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "ERROR: systemd not found. The Network guard needs a systemd Linux host (Raspberry Pi OS)." >&2
    exit 1
fi

if [[ -z "$DATA_DIR" && -f "$OUTPOST_DIR/.env" ]]; then
    DATA_DIR="$(sed -n 's/^NETWORK_DATA_DIR=//p' "$OUTPOST_DIR/.env" | tail -n 1)"
    DATA_DIR="${DATA_DIR%\"}"; DATA_DIR="${DATA_DIR#\"}"
fi
DATA_DIR="${DATA_DIR:-./data/network}"
case "$DATA_DIR" in
    /*) ;;
    *) DATA_DIR="$OUTPOST_DIR/${DATA_DIR#./}" ;;
esac
if [[ ! -d "$DATA_DIR" ]]; then
    echo "ERROR: $DATA_DIR does not exist. Run ./install.sh with the Network module first." >&2
    exit 1
fi
DATA_DIR="$(cd "$DATA_DIR" && pwd -P)"
# systemd unit paths: no spaces or specials (they would need escaping)
if [[ ! "$DATA_DIR" =~ ^/[A-Za-z0-9._/@+-]+$ ]]; then
    echo "ERROR: the data folder path '$DATA_DIR' contains spaces or special characters." >&2
    echo "Move NETWORK_DATA_DIR to a plain path (./install.sh) and try again." >&2
    exit 1
fi

missing=()
command -v nft >/dev/null 2>&1 || missing+=(nftables)
command -v iw >/dev/null 2>&1 || missing+=(iw)
if (( ${#missing[@]} > 0 )); then
    if command -v apt-get >/dev/null 2>&1; then
        echo "Installing ${missing[*]} (apt)"
        apt-get install -y --no-install-recommends "${missing[@]}"
    else
        echo "ERROR: please install: ${missing[*]}" >&2
        exit 1
    fi
fi

echo "Installing outpost-network-guard.sh to $BIN_PATH"
install -m 755 "$SCRIPT_DIR/outpost-network-guard.sh" "$BIN_PATH"
echo "Installing outpost-network-hotspot.sh to $HOTSPOT_BIN_PATH"
install -m 755 "$SCRIPT_DIR/outpost-network-hotspot.sh" "$HOTSPOT_BIN_PATH"

echo "Writing $ENV_PATH (DATA_DIR=$DATA_DIR)"
# keep a HOTSPOT_CONNECTION the user added (the hotspot's NetworkManager profile)
HOTSPOT_CONNECTION=""
[[ -f "$ENV_PATH" ]] && HOTSPOT_CONNECTION="$(sed -n 's/^HOTSPOT_CONNECTION=//p' "$ENV_PATH" | head -n 1)"
{
    printf '# written by install-network-guard.sh\nDATA_DIR=%s\n' "$DATA_DIR"
    if [[ -n "$HOTSPOT_CONNECTION" ]]; then
        printf 'HOTSPOT_CONNECTION=%s\n' "$HOTSPOT_CONNECTION"
    fi
} > "$ENV_PATH"
chmod 644 "$ENV_PATH"

echo "Installing systemd units"
install -m 644 "$SCRIPT_DIR/outpost-network-guard.service" "$SERVICE_PATH"
sed "s|@LIST@|$DATA_DIR/blocked.macs|" "$SCRIPT_DIR/outpost-network-guard.path.in" > "$PATH_UNIT_PATH"
chmod 644 "$PATH_UNIT_PATH"
install -m 644 "$SCRIPT_DIR/outpost-network-hotspot.service" "$HOTSPOT_SERVICE_PATH"
sed "s|@REQUEST@|$DATA_DIR/hotspot.request|" "$SCRIPT_DIR/outpost-network-hotspot.path.in" > "$HOTSPOT_PATH_UNIT_PATH"
chmod 644 "$HOTSPOT_PATH_UNIT_PATH"

systemctl daemon-reload
systemctl enable outpost-network-guard.service outpost-network-guard.path outpost-network-hotspot.path
systemctl restart outpost-network-guard.path outpost-network-hotspot.path
# tell the module the switch is there (does not apply an old request)
"$HOTSPOT_BIN_PATH" --report >/dev/null || echo "WARNING: could not write hotspot.json" >&2
systemctl start outpost-network-guard.service || {
    echo "WARNING: the first run failed, see: journalctl -u outpost-network-guard.service" >&2
}

cat <<EOT

Network guard installed. Devices blocked on the Network screen are now
cut off from the Pi (and its internet) within a second, also after reboots.
The hotspot switch on the Network screen works too.

    Status:     systemctl status outpost-network-guard.path
    Log:        journalctl -u outpost-network-guard.service
    Hotspot:    journalctl -u outpost-network-hotspot.service
    Rules:      sudo nft list table inet outpost_network
    Uninstall:  sudo $SCRIPT_DIR/uninstall-network-guard.sh

EOT
