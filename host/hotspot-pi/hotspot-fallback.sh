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
# systemd unit. Started by hand in a terminal, it first asks which WiFi
# interface to use (default: WIFI_IFACE from the config file).
#
# Usage: sudo hotspot-fallback.sh [--iface IFACE] [--hotspot]
#
#   --iface IFACE   use IFACE without asking (also overrides WIFI_IFACE)
#   --hotspot       skip the preferred WLAN and start the hotspot right
#                   away (the hotspot switch of outpost's Network module)

set -euo pipefail

ENV_FILE="/etc/hotspot-fallback.env"
LOG_TAG="hotspot-fallback"
PREFERRED_CON_NAME="preferred-wifi"
HOTSPOT_CON_NAME="pi-hotspot"
DEFAULT_HOTSPOT_SSID="Basecamp-1"

log() {
    logger -t "$LOG_TAG" "$*"
    echo "[$LOG_TAG] $*"
}

die() {
    log "ERROR: $*"
    exit 1
}

usage() {
    echo "Usage: sudo $0 [--iface IFACE] [--hotspot]"
}

IFACE_ARG=""
FORCE_HOTSPOT=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --iface)
            [[ $# -ge 2 && -n "$2" ]] || { usage >&2; exit 1; }
            IFACE_ARG="$2"
            shift 2
            ;;
        --iface=*)
            IFACE_ARG="${1#--iface=}"
            shift
            ;;
        --hotspot)
            FORCE_HOTSPOT=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    die "This script must be run as root."
fi

if [[ ! -f "$ENV_FILE" ]]; then
    die "Config file $ENV_FILE not found. Copy hotspot-fallback.env.example there and edit it."
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

HOTSPOT_SSID="${HOTSPOT_SSID:-$DEFAULT_HOTSPOT_SSID}"

: "${PREFERRED_SSID:?PREFERRED_SSID not set in $ENV_FILE}"
: "${PREFERRED_PASSWORD:?PREFERRED_PASSWORD not set in $ENV_FILE}"
: "${HOTSPOT_PASSWORD:?HOTSPOT_PASSWORD not set in $ENV_FILE}"

command -v nmcli >/dev/null 2>&1 || die "nmcli not found. Is NetworkManager installed?"

# WiFi interfaces as "device<TAB>state<TAB>connection", one per line.
list_wifi_ifaces() {
    nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status 2>/dev/null \
        | awk -F: '$2=="wifi" {printf "%s\t%s\t%s\n", $1, $3, $4}'
}

iface_exists() {
    nmcli -t -f DEVICE device status 2>/dev/null | awk -v d="$1" '$0==d {f=1} END {exit !f}'
}

# Writes WIFI_IFACE=<iface> into ENV_FILE (replacing or appending it).
save_iface() {
    local tmp
    tmp=$(mktemp "${ENV_FILE}.XXXXXX")
    awk -v v="$1" '
        /^[[:space:]]*WIFI_IFACE=/ { print "WIFI_IFACE=" v; done=1; next }
        { print }
        END { if (!done) print "WIFI_IFACE=" v }
    ' "$ENV_FILE" > "$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$ENV_FILE"
}

# Asks which WiFi interface to use. Sets WIFI_IFACE.
choose_iface() {
    local lines=() line default_idx=1 i=1 answer dev state con
    while IFS= read -r line; do
        [[ -n "$line" ]] && lines+=("$line")
    done < <(list_wifi_ifaces)

    if [[ ${#lines[@]} -eq 0 ]]; then
        die "No WiFi interface found (see: nmcli device status)."
    fi

    echo "WiFi interfaces:"
    for line in "${lines[@]}"; do
        IFS=$'\t' read -r dev state con <<< "$line"
        [[ "$dev" == "${WIFI_IFACE:-}" ]] && default_idx=$i
        printf '  %d) %-12s %-14s %s\n' "$i" "$dev" "$state" "${con:+($con)}"
        i=$((i + 1))
    done

    while true; do
        printf 'Start the hotspot on which interface? [%d] ' "$default_idx"
        read -r answer </dev/tty || answer=""
        answer="${answer:-$default_idx}"
        if [[ "$answer" =~ ^[0-9]+$ ]] && (( answer >= 1 && answer <= ${#lines[@]} )); then
            IFS=$'\t' read -r dev state con <<< "${lines[answer-1]}"
            break
        fi
        echo "Please enter a number between 1 and ${#lines[@]}."
    done

    if [[ "$dev" != "${WIFI_IFACE:-}" ]]; then
        printf 'Use %s at boot too (save it in %s)? [y/N] ' "$dev" "$ENV_FILE"
        read -r answer </dev/tty || answer=""
        case "$answer" in
            [yY]*) save_iface "$dev"; log "Saved WIFI_IFACE=$dev in $ENV_FILE." ;;
        esac
    fi
    WIFI_IFACE="$dev"
}

if [[ -n "$IFACE_ARG" ]]; then
    WIFI_IFACE="$IFACE_ARG"
elif [[ -t 0 && -t 1 ]]; then
    choose_iface
fi

: "${WIFI_IFACE:?WIFI_IFACE not set in $ENV_FILE}"

if ! iface_exists "$WIFI_IFACE"; then
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

if $FORCE_HOTSPOT; then
    log "Hotspot requested: not looking for '$PREFERRED_SSID'."
else
    log "Scanning for preferred SSID '$PREFERRED_SSID' on $WIFI_IFACE ..."
fi

if ! $FORCE_HOTSPOT && scan_for_preferred_ssid; then
    log "Preferred SSID '$PREFERRED_SSID' found. Connecting as client."
    deactivate_connection "$HOTSPOT_CON_NAME"
    ensure_preferred_profile
    if nmcli connection up "$PREFERRED_CON_NAME" ifname "$WIFI_IFACE"; then
        log "Connected to '$PREFERRED_SSID'."
        exit 0
    else
        log "WARNING: Failed to connect to '$PREFERRED_SSID'. Falling back to hotspot."
    fi
elif ! $FORCE_HOTSPOT; then
    log "Preferred SSID '$PREFERRED_SSID' not found."
fi

log "Starting hotspot '$HOTSPOT_SSID' on $WIFI_IFACE ..."
deactivate_connection "$PREFERRED_CON_NAME"
ensure_hotspot_profile
nmcli connection up "$HOTSPOT_CON_NAME" ifname "$WIFI_IFACE" \
    || die "Failed to start hotspot '$HOTSPOT_SSID'."
log "Hotspot '$HOTSPOT_SSID' is active."
