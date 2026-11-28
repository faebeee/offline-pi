#!/usr/bin/env bash
#
# uninstall-hotspot-name.sh
#
# Reverses install-hotspot-name.sh: stops the mDNS announcement and removes
# the script, the dispatcher hook, the service, the hotspot DNS entry, the
# hosts folder and /etc/outpost-hotspot-name.env. The hotspot itself is
# left as it is. avahi-daemon and avahi-utils stay installed (Raspberry Pi
# OS ships avahi-daemon; it also announces <hostname>.local).
#
# Usage: sudo ./uninstall-hotspot-name.sh

set -euo pipefail

BIN_PATH="/usr/local/bin/outpost-hotspot-name.sh"
HOOK_PATH="/etc/NetworkManager/dispatcher.d/90-outpost-hotspot-name"
SERVICE_PATH="/etc/systemd/system/outpost-hotspot-name.service"
SERVICE_NAME="outpost-hotspot-name.service"
ENV_PATH="/etc/outpost-hotspot-name.env"
RUN_ENV="/run/outpost-hotspot-name.env"
DNSMASQ_CONF="/etc/NetworkManager/dnsmasq-shared.d/outpost-hotspot-name.conf"
HOSTS_DIR="/var/lib/outpost-hotspot-name"

if [[ $# -gt 0 ]]; then
    echo "Usage: sudo $0" >&2
    exit 1
fi

if [[ $EUID -ne 0 ]]; then
    echo "Please run this uninstaller as root (e.g. sudo $0)" >&2
    exit 1
fi

# the hook first, so the hotspot coming up meanwhile starts nothing
for f in "$HOOK_PATH" "$BIN_PATH"; do
    if [[ -f "$f" ]]; then
        echo "Removing $f"
        rm -f "$f"
    fi
done

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Stopping $SERVICE_NAME"
    systemctl stop "$SERVICE_NAME"
fi

if [[ -f "$SERVICE_PATH" ]]; then
    echo "Removing $SERVICE_PATH"
    rm -f "$SERVICE_PATH"
    systemctl daemon-reload
fi

# the drop-in before the folder it points to: a hotspot starting with a
# hostsdir that doesn't exist must not happen
for f in "$DNSMASQ_CONF" "$ENV_PATH" "$RUN_ENV"; do
    if [[ -f "$f" ]]; then
        echo "Removing $f"
        rm -f "$f"
    fi
done

if [[ -d "$HOSTS_DIR" ]]; then
    echo "Removing $HOSTS_DIR"
    rm -rf "$HOSTS_DIR"
fi

cat <<EOF

The hotspot name is removed. If the hotspot runs now, its DNS server may
answer the name until the hotspot's next start. Devices on the hotspot reach
outpost at the Pi's address (usually http://10.42.0.1:8080).
EOF
