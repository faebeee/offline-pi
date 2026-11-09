#!/usr/bin/env bash
#
# uninstall-hotspot-fallback.sh
#
# Reverses install-hotspot-fallback.sh: stops and disables the systemd
# service, removes the installed script/service/config files, and
# optionally removes the NetworkManager connection profiles that
# hotspot-fallback.sh creates (preferred-wifi, pi-hotspot).
#
# Usage: sudo ./uninstall-hotspot-fallback.sh [--purge]
#
#   --purge   also remove /etc/hotspot-fallback.env (which holds your
#             WiFi credentials). Without this flag the config file is
#             left in place in case you reinstall later.

set -euo pipefail

BIN_PATH="/usr/local/bin/hotspot-fallback.sh"
ENV_PATH="/etc/hotspot-fallback.env"
SERVICE_PATH="/etc/systemd/system/hotspot-fallback.service"
SERVICE_NAME="hotspot-fallback.service"
PREFERRED_CON_NAME="preferred-wifi"
HOTSPOT_CON_NAME="pi-hotspot"

PURGE=false
for arg in "$@"; do
    case "$arg" in
        --purge) PURGE=true ;;
        *)
            echo "Unknown option: $arg" >&2
            echo "Usage: sudo $0 [--purge]" >&2
            exit 1
            ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    echo "Please run this uninstaller as root (e.g. sudo $0)" >&2
    exit 1
fi

if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "Stopping $SERVICE_NAME"
    systemctl stop "$SERVICE_NAME"
fi

if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1 && systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "Disabling $SERVICE_NAME"
    systemctl disable "$SERVICE_NAME"
fi

if [[ -f "$SERVICE_PATH" ]]; then
    echo "Removing $SERVICE_PATH"
    rm -f "$SERVICE_PATH"
    systemctl daemon-reload
fi

if [[ -f "$BIN_PATH" ]]; then
    echo "Removing $BIN_PATH"
    rm -f "$BIN_PATH"
fi

if command -v nmcli >/dev/null 2>&1; then
    for con in "$HOTSPOT_CON_NAME" "$PREFERRED_CON_NAME"; do
        if nmcli -t -f NAME connection show | grep -Fxq "$con"; then
            echo "Removing NetworkManager connection profile '$con'"
            nmcli connection delete "$con" >/dev/null 2>&1 || true
        fi
    done
else
    echo "WARNING: nmcli not found, skipping NetworkManager connection cleanup." >&2
fi

if [[ "$PURGE" == true ]]; then
    if [[ -f "$ENV_PATH" ]]; then
        echo "Removing $ENV_PATH"
        rm -f "$ENV_PATH"
    fi
else
    if [[ -f "$ENV_PATH" ]]; then
        echo "Leaving $ENV_PATH in place (re-run with --purge to remove it)."
    fi
fi

cat <<EOF

Uninstall complete.

$(if [[ "$PURGE" != true && -f "$ENV_PATH" ]]; then echo "Your WiFi credentials are still saved in $ENV_PATH."; fi)
EOF
