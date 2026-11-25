#!/usr/bin/env bash
#
# outpost-network-hotspot.sh
#
# Switches the Pi's Wi-Fi hotspot on or off for outpost's Network module.
# The module runs in a rootless container and can't control
# NetworkManager, so it writes "on" or "off" to
# <NETWORK_DATA_DIR>/hotspot.request and this script, run as root by
# outpost-network-hotspot.service whenever that file changes
# (outpost-network-hotspot.path):
#
#   on:   starts the hotspot. With host/hotspot-pi installed it runs
#         `hotspot-fallback.sh --hotspot` (creates the profile from
#         /etc/hotspot-fallback.env if needed); otherwise it brings up the
#         existing NetworkManager profile.
#   off:  takes the hotspot profile down. NetworkManager then joins the
#         preferred Wi-Fi by itself if it is in range.
#
# and reports back in <NETWORK_DATA_DIR>/hotspot.json.
#
# The request file is written by an unprivileged user: only "on" and "off"
# are accepted. It is not applied at boot (hotspot-fallback.service decides
# there); only a change of the file triggers this script.
#
# Config: /etc/outpost-network-guard.env (DATA_DIR=..., optional
# HOTSPOT_CONNECTION=<NetworkManager profile>, default pi-hotspot).
#
# Usage: sudo outpost-network-hotspot.sh [--report]
#   --report   only write hotspot.json (used by the installer)

set -euo pipefail

ENV_FILE="/etc/outpost-network-guard.env"
FALLBACK_BIN="/usr/local/bin/hotspot-fallback.sh"
LOG_TAG="outpost-network-hotspot"

log() {
    logger -t "$LOG_TAG" "$*" 2>/dev/null || true
    echo "[$LOG_TAG] $*"
}

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root." >&2
    exit 1
fi

REPORT_ONLY=false
case "${1:-}" in
    --report) REPORT_ONLY=true ;;
    "") ;;
    *) echo "Usage: sudo $0 [--report]" >&2; exit 1 ;;
esac

[[ -f "$ENV_FILE" ]] || { log "ERROR: $ENV_FILE not found."; exit 1; }
DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | head -n 1)"
CON="$(sed -n 's/^HOTSPOT_CONNECTION=//p' "$ENV_FILE" | head -n 1)"
CON="${CON:-pi-hotspot}"
[[ -n "$DATA_DIR" && -d "$DATA_DIR" ]] || { log "ERROR: data folder '$DATA_DIR' not found (drive not mounted?)."; exit 1; }

REQUEST_FILE="$DATA_DIR/hotspot.request"
STATUS="$DATA_DIR/hotspot.json"

json_str() {
    if [[ -n "$1" ]]; then
        printf '"%s"' "$(printf '%s' "$1" | tr -d '"\\\n' | head -c 300)"
    else
        printf 'null'
    fi
}

# write hotspot.json without following a symlink someone placed there
report() {
    local request="$1" error="$2" tmp json
    json="{\"applied_at\": $(date +%s), \"request\": $(json_str "$request"), \"connection\": $(json_str "$CON"), \"error\": $(json_str "$error")}"
    tmp="$(mktemp "$DATA_DIR/.hotspot.json.XXXXXX")"
    printf '%s\n' "$json" > "$tmp"
    chmod 644 "$tmp"
    chown "$(stat -c %u:%g "$DATA_DIR")" "$tmp" 2>/dev/null || true
    mv -f "$tmp" "$STATUS"
}

fail() {
    log "ERROR: $2"
    report "$1" "$2"
    exit 1
}

REQUEST=""
if [[ -f "$REQUEST_FILE" && ! -L "$REQUEST_FILE" ]]; then
    REQUEST="$(head -c 16 "$REQUEST_FILE" | tr -d '[:space:]')"
fi

if $REPORT_ONLY || [[ -z "$REQUEST" ]]; then
    report "" ""
    exit 0
fi

case "$REQUEST" in
    on | off) ;;
    *) fail "" "Ignored an invalid request (expected on or off)." ;;
esac

command -v nmcli >/dev/null 2>&1 || fail "$REQUEST" "nmcli not found: the hotspot switch needs NetworkManager"

# captured first: `nmcli | grep -q` fails at random under pipefail
names="$(nmcli -t -f NAME connection show 2>/dev/null || true)"
active="$(nmcli -t -f NAME connection show --active 2>/dev/null || true)"
has_profile=false; grep -Fxq -- "$CON" <<< "$names" && has_profile=true
is_active=false; grep -Fxq -- "$CON" <<< "$active" && is_active=true

if [[ "$REQUEST" == on ]]; then
    if $is_active; then
        log "Hotspot '$CON' is already on."
    elif [[ -x "$FALLBACK_BIN" ]]; then
        log "Starting the hotspot (hotspot-fallback.sh --hotspot)."
        if ! err="$("$FALLBACK_BIN" --hotspot </dev/null 2>&1)"; then
            fail on "Could not start the hotspot: $(printf '%s' "$err" | tail -n 1)"
        fi
    elif $has_profile; then
        log "Starting hotspot profile '$CON'."
        if ! err="$(nmcli connection up "$CON" 2>&1)"; then
            fail on "Could not start the hotspot: $(printf '%s' "$err" | tail -n 1)"
        fi
    else
        fail on "No hotspot set up on the Pi: install host/hotspot-pi (sudo ./install-hotspot-fallback.sh)"
    fi
else
    if $is_active; then
        log "Stopping hotspot '$CON'."
        if ! err="$(nmcli connection down "$CON" 2>&1)"; then
            fail off "Could not stop the hotspot: $(printf '%s' "$err" | tail -n 1)"
        fi
    else
        log "Hotspot '$CON' is already off."
    fi
fi

report "$REQUEST" ""
log "Hotspot switched $REQUEST."
