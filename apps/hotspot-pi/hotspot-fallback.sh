#!/usr/bin/env bash
#
# hotspot-fallback.sh
#
# Tries to connect this Pi to a preferred WLAN. If that WLAN is not in
# range, falls back to broadcasting a WiFi hotspot on the same interface.
#
# Configuration is read from /etc/hotspot-fallback.env (see
# hotspot-fallback.env.example for the expected variables).
#
# Intended to be run once at boot via the hotspot-fallback.service
# systemd unit.

set -euo pipefail

ENV_FILE="/etc/hotspot-fallback.env"
LOG_TAG="hotspot-fallback"
PREFERRED_CON_NAME="preferred-wifi"
HOTSPOT_CON_NAME="pi-hotspot"

log() {
    logger -t "$LOG_TAG" "$*"
    echo "[$LOG_TAG] $*"
}

die() {
    log "ERROR: $*"
    exit 1
}

if [[ $EUID -ne 0 ]]; then
    die "This script must be run as root."
fi

if [[ ! -f "$ENV_FILE" ]]; then
    die "Config file $ENV_FILE not found. Copy hotspot-fallback.env.example there and edit it."
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${WIFI_IFACE:?WIFI_IFACE not set in $ENV_FILE}"
: "${PREFERRED_SSID:?PREFERRED_SSID not set in $ENV_FILE}"
: "${PREFERRED_PASSWORD:?PREFERRED_PASSWORD not set in $ENV_FILE}"
: "${HOTSPOT_SSID:?HOTSPOT_SSID not set in $ENV_FILE}"
: "${HOTSPOT_PASSWORD:?HOTSPOT_PASSWORD not set in $ENV_FILE}"

command -v nmcli >/dev/null 2>&1 || die "nmcli not found. Is NetworkManager installed?"

if ! nmcli -t -f DEVICE,STATE device status | grep -q "^${WIFI_IFACE}:"; then
    die "WiFi interface '$WIFI_IFACE' not found. Check WIFI_IFACE in $ENV_FILE (see: nmcli device status)."
fi

wait_for_wifi_device() {
    local tries=10
    while (( tries > 0 )); do
        local state
        state=$(nmcli -t -f DEVICE,STATE device status | awk -F: -v d="$WIFI_IFACE" '$1==d {print $2}')
        if [[ "$state" != "unavailable" && "$state" != "unmanaged" ]]; then
            return 0
        fi
        sleep 1
        ((tries--))
    done
    return 1
}

wait_for_wifi_device || log "WARNING: WiFi device '$WIFI_IFACE' did not reach a ready state in time; continuing anyway."

scan_for_preferred_ssid() {
    nmcli device wifi rescan ifname "$WIFI_IFACE" >/dev/null 2>&1 || true
    # Give the adapter a moment to collect scan results.
    sleep 5
    nmcli -t -f SSID device wifi list ifname "$WIFI_IFACE" 2>/dev/null | grep -Fxq "$PREFERRED_SSID"
}

ensure_preferred_profile() {
    if nmcli -t -f NAME connection show | grep -Fxq "$PREFERRED_CON_NAME"; then
        nmcli connection modify "$PREFERRED_CON_NAME" \
            wifi.ssid "$PREFERRED_SSID" \
            wifi-sec.key-mgmt wpa-psk \
            wifi-sec.psk "$PREFERRED_PASSWORD" \
            connection.interface-name "$WIFI_IFACE" \
            connection.autoconnect yes \
            connection.autoconnect-priority 100
    else
        nmcli connection add \
            type wifi \
            ifname "$WIFI_IFACE" \
            con-name "$PREFERRED_CON_NAME" \
            ssid "$PREFERRED_SSID" \
            wifi-sec.key-mgmt wpa-psk \
            wifi-sec.psk "$PREFERRED_PASSWORD" \
            connection.autoconnect yes \
            connection.autoconnect-priority 100
    fi
}

ensure_hotspot_profile() {
    if nmcli -t -f NAME connection show | grep -Fxq "$HOTSPOT_CON_NAME"; then
        nmcli connection modify "$HOTSPOT_CON_NAME" \
            wifi.ssid "$HOTSPOT_SSID" \
            wifi-sec.key-mgmt wpa-psk \
            wifi-sec.psk "$HOTSPOT_PASSWORD" \
            connection.interface-name "$WIFI_IFACE" \
            connection.autoconnect no
    else
        nmcli connection add \
            type wifi \
            ifname "$WIFI_IFACE" \
            con-name "$HOTSPOT_CON_NAME" \
            ssid "$HOTSPOT_SSID" \
            802-11-wireless.mode ap \
            802-11-wireless.band bg \
            ipv4.method shared \
            ipv6.method ignore \
            wifi-sec.key-mgmt wpa-psk \
            wifi-sec.psk "$HOTSPOT_PASSWORD" \
            connection.autoconnect no
    fi
}

deactivate_connection() {
    local name="$1"
    if nmcli -t -f NAME connection show --active | grep -Fxq "$name"; then
        log "Deactivating connection '$name'"
        nmcli connection down "$name" >/dev/null 2>&1 || true
    fi
}

log "Scanning for preferred SSID '$PREFERRED_SSID' on $WIFI_IFACE ..."

if scan_for_preferred_ssid; then
    log "Preferred SSID '$PREFERRED_SSID' found. Connecting as client."
    deactivate_connection "$HOTSPOT_CON_NAME"
    ensure_preferred_profile
    if nmcli connection up "$PREFERRED_CON_NAME" ifname "$WIFI_IFACE"; then
        log "Connected to '$PREFERRED_SSID'."
        exit 0
    else
        log "WARNING: Failed to connect to '$PREFERRED_SSID'. Falling back to hotspot."
    fi
else
    log "Preferred SSID '$PREFERRED_SSID' not found."
fi

log "Starting hotspot '$HOTSPOT_SSID' on $WIFI_IFACE ..."
deactivate_connection "$PREFERRED_CON_NAME"
ensure_hotspot_profile
nmcli connection up "$HOTSPOT_CON_NAME" ifname "$WIFI_IFACE" \
    || die "Failed to start hotspot '$HOTSPOT_SSID'."
log "Hotspot '$HOTSPOT_SSID' is active."
