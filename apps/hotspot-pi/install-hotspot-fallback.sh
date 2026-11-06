#!/usr/bin/env bash
#
# install-hotspot-fallback.sh
#
# Installs the hotspot-fallback script and systemd service on a
# Raspberry Pi running Raspberry Pi OS Bookworm (NetworkManager).
#
# Usage: sudo ./install-hotspot-fallback.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BIN_PATH="/usr/local/bin/hotspot-fallback.sh"
ENV_PATH="/etc/hotspot-fallback.env"
SERVICE_PATH="/etc/systemd/system/hotspot-fallback.service"

if [[ $EUID -ne 0 ]]; then
    echo "Please run this installer as root (e.g. sudo $0)" >&2
    exit 1
fi

if ! command -v nmcli >/dev/null 2>&1; then
    echo "ERROR: nmcli not found. This installer expects NetworkManager" >&2
    echo "(Raspberry Pi OS Bookworm or newer)." >&2
    exit 1
fi

if ! systemctl is-active --quiet NetworkManager; then
    echo "WARNING: NetworkManager does not appear to be active." >&2
    echo "Make sure it is enabled before rebooting: sudo systemctl enable --now NetworkManager" >&2
fi

echo "Installing hotspot-fallback.sh to $BIN_PATH"
install -m 755 "$SCRIPT_DIR/hotspot-fallback.sh" "$BIN_PATH"

if [[ -f "$ENV_PATH" ]]; then
    echo "Config file $ENV_PATH already exists, leaving it untouched."
else
    echo "Creating config file $ENV_PATH from template (edit it with real credentials!)"
    install -m 600 "$SCRIPT_DIR/hotspot-fallback.env.example" "$ENV_PATH"
fi

echo "Installing systemd service to $SERVICE_PATH"
install -m 644 "$SCRIPT_DIR/hotspot-fallback.service" "$SERVICE_PATH"

echo "Reloading systemd and enabling hotspot-fallback.service"
systemctl daemon-reload
systemctl enable hotspot-fallback.service

cat <<EOF

Installation complete.

IMPORTANT: Before rebooting, edit $ENV_PATH and set your real
WIFI_IFACE, PREFERRED_SSID/PASSWORD and HOTSPOT_SSID/PASSWORD:

    sudo nano $ENV_PATH

You can test it immediately without rebooting by running:

    sudo systemctl start hotspot-fallback.service
    journalctl -u hotspot-fallback.service -f

EOF
