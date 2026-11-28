#!/usr/bin/env bash
#
# outpost-hotspot-name.sh
#
# Gives the Pi a name on its Wi-Fi hotspot, so devices that joined it open
# outpost at http://<name>.local:8080 (default name: basecamp) instead of
# http://10.42.0.1:8080. Two ways, because clients resolve ".local"
# differently:
#
#   mDNS:  avahi-publish announces <name>.local with the hotspot's address
#          (outpost-hotspot-name.service). iPhone, iPad, Mac, Windows 10+,
#          Android 12+ and Linux ask this way.
#   DNS:   NetworkManager's dnsmasq (the hotspot's DHCP and DNS server)
#          answers <name>.local and <name> from a hosts file it watches
#          (hostsdir, see install-hotspot-name.sh), for clients that send
#          ".local" to their DNS server instead.
#
# Run by NetworkManager's dispatcher (90-outpost-hotspot-name) as
#   outpost-hotspot-name.sh IFACE ACTION
# with CONNECTION_ID and IP4_ADDRESS_0 in the environment: on "up" of the
# hotspot profile it writes the hosts file and starts the mDNS service, on
# "down" it stops the service. The installer runs it with --apply to bring
# it in line with the hotspot's current state.
#
# Config: /etc/outpost-hotspot-name.env (NAME=..., CONNECTION=<NetworkManager
# profile>, default pi-hotspot).
#
# Usage: sudo outpost-hotspot-name.sh --apply
#        outpost-hotspot-name.sh IFACE up|down   (NetworkManager dispatcher)

set -euo pipefail

ENV_FILE="/etc/outpost-hotspot-name.env"
RUN_ENV="/run/outpost-hotspot-name.env"
HOSTS_DIR="/var/lib/outpost-hotspot-name"
HOSTS_FILE="$HOSTS_DIR/hosts"
SERVICE="outpost-hotspot-name.service"
DEFAULT_IP="10.42.0.1"
LOG_TAG="outpost-hotspot-name"

log() {
    logger -t "$LOG_TAG" "$*" 2>/dev/null || true
    echo "[$LOG_TAG] $*"
}

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root." >&2
    exit 1
fi

[[ -f "$ENV_FILE" ]] || { log "ERROR: $ENV_FILE not found."; exit 1; }
NAME="$(sed -n 's/^NAME=//p' "$ENV_FILE" | head -n 1)"
CON="$(sed -n 's/^CONNECTION=//p' "$ENV_FILE" | head -n 1)"
CON="${CON:-pi-hotspot}"
# the installer checks it; check again, the file is root's but be strict
if [[ ! "$NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    log "ERROR: NAME='$NAME' in $ENV_FILE is not a valid name (a-z, 0-9, -)."
    exit 1
fi

# valid_ipv4 IP - a dotted IPv4 address (it ends up in config files)
valid_ipv4() {
    [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

# iface_ip IFACE - the interface's first IPv4 address
iface_ip() {
    ip -4 -o addr show dev "$1" 2>/dev/null | awk 'NR == 1 {sub(/\/.*/, "", $4); print $4}' || true
}

# write_hosts IP - the hosts file dnsmasq watches; replaced in one step,
# so dnsmasq never reads half of it
write_hosts() {
    local ip="$1" tmp
    mkdir -p "$HOSTS_DIR"
    chmod 755 "$HOSTS_DIR"
    if [[ -f "$HOSTS_FILE" ]] && [[ "$(cat "$HOSTS_FILE")" == "$ip $NAME.local $NAME" ]]; then
        return 0
    fi
    tmp="$(mktemp "$HOSTS_DIR/.hosts.XXXXXX")"
    printf '%s %s.local %s\n' "$ip" "$NAME" "$NAME" > "$tmp"
    chmod 644 "$tmp"
    mv -f "$tmp" "$HOSTS_FILE"
}

# own_name - avahi already announces the host name itself: publishing the
# same name again would collide with it
own_name() {
    local host
    host="$(hostname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')"
    [[ "$host" == "$NAME" ]]
}

up() {
    local iface="$1" ip="$2"
    [[ -n "$ip" ]] || ip="$(iface_ip "$iface")"
    [[ -n "$ip" ]] || ip="$DEFAULT_IP"
    if ! valid_ipv4 "$ip"; then
        log "ERROR: '$ip' is not an IPv4 address; nothing announced."
        exit 1
    fi
    write_hosts "$ip"
    if own_name; then
        log "The Pi's host name is already '$NAME': avahi announces $NAME.local itself."
        systemctl stop --no-block "$SERVICE" 2>/dev/null || true
    else
        printf 'HOTSPOT_FQDN=%s.local\nHOTSPOT_IP=%s\n' "$NAME" "$ip" > "$RUN_ENV"
        # restart: the address may have changed
        systemctl restart --no-block "$SERVICE"
    fi
    log "Hotspot '$CON' on $iface: $NAME.local is $ip."
}

down() {
    systemctl stop --no-block "$SERVICE" 2>/dev/null || true
    rm -f "$RUN_ENV"
    log "Hotspot '$CON' is down: $NAME.local is no longer announced."
}

# apply - bring the announcement in line with the hotspot's current state
apply() {
    local dev
    dev="$(nmcli -g GENERAL.DEVICES connection show --active "$CON" 2>/dev/null | head -n 1 || true)"
    if [[ -n "$dev" ]]; then
        up "$dev" ""
    else
        # the hosts file is only read while the hotspot runs; write it now
        # so the first start already answers
        write_hosts "$DEFAULT_IP"
        down
    fi
}

case "${1:-}" in
    --apply) apply; exit 0 ;;
esac

IFACE="${1:-}"
ACTION="${2:-}"
case "$ACTION" in
    up | down) ;;
    *) exit 0 ;;
esac
[[ "${CONNECTION_ID:-}" == "$CON" ]] || exit 0

if [[ "$ACTION" == up ]]; then
    # IP4_ADDRESS_0 is "10.42.0.1/24 0.0.0.0"
    addr="${IP4_ADDRESS_0:-}"
    addr="${addr%% *}"
    up "$IFACE" "${addr%%/*}"
else
    down
fi
