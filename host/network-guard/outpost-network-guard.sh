#!/usr/bin/env bash
#
# outpost-network-guard.sh
#
# Enforces the block list of outpost's Network module. The module runs in a
# rootless container and can't touch the firewall, so it writes the blocked
# MAC addresses to <NETWORK_DATA_DIR>/blocked.macs (one per line) and this
# script, run as root by outpost-network-guard.service whenever that file
# changes (outpost-network-guard.path) and at boot:
#
#   1. puts the MACs into the nftables set inet outpost_network/blocked,
#      whose prerouting rule drops every packet from them (DHCP, DNS,
#      the web app, the internet: the device is on the Wi-Fi but gets
#      nothing),
#   2. disconnects them from every access-point interface (iw station del),
#   3. reports back in <NETWORK_DATA_DIR>/enforcer.json.
#
# The file is written by an unprivileged user, so every line is checked
# against a strict MAC pattern; anything else is ignored.
#
# Config: /etc/outpost-network-guard.env (DATA_DIR=..., written by the
# installer).
#
# Usage: sudo outpost-network-guard.sh [--clear]
#   --clear   remove the nftables table: unblocks every device until the
#             next change of the block list

set -euo pipefail

ENV_FILE="/etc/outpost-network-guard.env"
TABLE="outpost_network"
MAX_MACS=1000
LOG_TAG="outpost-network-guard"

log() {
    logger -t "$LOG_TAG" "$*" 2>/dev/null || true
    echo "[$LOG_TAG] $*"
}

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root." >&2
    exit 1
fi

if [[ "${1:-}" == "--clear" ]]; then
    nft delete table inet "$TABLE" 2>/dev/null || true
    log "Removed nftables table inet $TABLE."
    exit 0
fi

[[ -f "$ENV_FILE" ]] || { log "ERROR: $ENV_FILE not found."; exit 1; }
DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | head -n 1)"
[[ -n "$DATA_DIR" && -d "$DATA_DIR" ]] || { log "ERROR: data folder '$DATA_DIR' not found (drive not mounted?)."; exit 1; }

LIST="$DATA_DIR/blocked.macs"
STATUS="$DATA_DIR/enforcer.json"

# write enforcer.json without following a symlink someone placed there:
# a fresh mktemp file, owned like the folder, renamed over the old one
report() {
    local error="$1" tmp json macs=""
    local m
    for m in "${MACS[@]+"${MACS[@]}"}"; do macs+="${macs:+,}\"$m\""; done
    if [[ -n "$error" ]]; then
        error="\"$(printf '%s' "$error" | tr -d '"\\\n' | head -c 300)\""
    else
        error=null
    fi
    json="{\"applied_at\": $(date +%s), \"macs\": [$macs], \"error\": $error}"
    tmp="$(mktemp "$DATA_DIR/.enforcer.json.XXXXXX")"
    printf '%s\n' "$json" > "$tmp"
    chmod 644 "$tmp"
    chown "$(stat -c %u:%g "$DATA_DIR")" "$tmp" 2>/dev/null || true
    mv -f "$tmp" "$STATUS"
}

MACS=()
if [[ -f "$LIST" && ! -L "$LIST" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="$(printf '%s' "$line" | tr 'A-F' 'a-f' | tr -d '[:space:]')"
        [[ "$line" =~ ^[0-9a-f]{2}(:[0-9a-f]{2}){5}$ ]] || continue
        MACS+=("$line")
        (( ${#MACS[@]} >= MAX_MACS )) && break
    done < "$LIST"
fi

# one nft transaction: (re)create the table with the set and the rule
rules="table inet $TABLE {}
delete table inet $TABLE
table inet $TABLE {
    set blocked {
        type ether_addr
"
if (( ${#MACS[@]} > 0 )); then
    rules+="        elements = { $(IFS=,; echo "${MACS[*]}") }
"
fi
rules+="    }
    chain prerouting {
        type filter hook prerouting priority -300; policy accept;
        ether saddr @blocked counter drop
    }
}
"
if ! err="$(printf '%s' "$rules" | nft -f - 2>&1)"; then
    log "ERROR: nft failed: $err"
    report "nft failed: $err"
    exit 1
fi

# disconnect them from every access point (they may rejoin, but get no traffic)
if (( ${#MACS[@]} > 0 )) && command -v iw >/dev/null 2>&1; then
    for ap in $(iw dev 2>/dev/null | awk '$1=="Interface"{i=$2} $1=="type" && $2=="AP"{print i}'); do
        for m in "${MACS[@]}"; do
            iw dev "$ap" station del "$m" >/dev/null 2>&1 || true
        done
    done
fi

report ""
log "Blocking ${#MACS[@]} device(s)."
