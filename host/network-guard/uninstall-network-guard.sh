#!/usr/bin/env bash
#
# uninstall-network-guard.sh
#
# Reverses install-network-guard.sh: stops and disables the units, removes
# the nftables table (every blocked device can connect again), the script,
# the units and /etc/outpost-network-guard.env, and the helper's status
# file (enforcer.json) in the data folder. The block list itself
# (blocked.json, blocked.macs) is the Network module's data and stays.
# nftables and iw stay installed.
#
# Usage: sudo ./uninstall-network-guard.sh

set -euo pipefail

BIN_PATH="/usr/local/bin/outpost-network-guard.sh"
ENV_PATH="/etc/outpost-network-guard.env"
SERVICE_PATH="/etc/systemd/system/outpost-network-guard.service"
PATH_UNIT_PATH="/etc/systemd/system/outpost-network-guard.path"

if [[ $# -gt 0 ]]; then
    echo "Usage: sudo $0" >&2
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "Please run this uninstaller as root (e.g. sudo $0)" >&2
    exit 1
fi

for unit in outpost-network-guard.path outpost-network-guard.service; do
    if systemctl is-enabled --quiet "$unit" 2>/dev/null || systemctl is-active --quiet "$unit" 2>/dev/null; then
        echo "Stopping and disabling $unit"
        systemctl disable --now "$unit" >/dev/null 2>&1 || true
    fi
done

if command -v nft >/dev/null 2>&1 && nft list table inet outpost_network >/dev/null 2>&1; then
    echo "Removing nftables table inet outpost_network (blocked devices can connect again)"
    nft delete table inet outpost_network
fi

DATA_DIR=""
[[ -f "$ENV_PATH" ]] && DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_PATH" | head -n 1)"
if [[ -n "$DATA_DIR" && -f "$DATA_DIR/enforcer.json" && ! -L "$DATA_DIR/enforcer.json" ]]; then
    echo "Removing $DATA_DIR/enforcer.json (the block list stays)"
    rm -f "$DATA_DIR/enforcer.json"
fi

for f in "$PATH_UNIT_PATH" "$SERVICE_PATH" "$BIN_PATH" "$ENV_PATH"; do
    if [[ -f "$f" ]]; then
        echo "Removing $f"
        rm -f "$f"
    fi
done
systemctl daemon-reload

echo
echo "Network guard uninstalled. The Network screen still lists devices,"
echo "but blocking is no longer enforced."
