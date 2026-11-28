#!/usr/bin/env bash
#
# install-hotspot-name.sh
#
# Installs the hotspot name: devices on the Pi's Wi-Fi hotspot open outpost
# at http://<name>.local:8080 (default name: basecamp). See
# outpost-hotspot-name.sh for how it works. Installs avahi-daemon and
# avahi-utils (avahi-publish) if missing.
#
# Re-run it to change the name; it keeps the current one otherwise.
#
# Usage: sudo ./install-hotspot-name.sh [--name NAME] [--connection PROFILE]
#
#   --name NAME           the name without ".local" (a-z, 0-9, -; default:
#                         the current one, else basecamp)
#   --connection PROFILE  the hotspot's NetworkManager profile (default: the
#                         current one, else pi-hotspot, as made by
#                         host/hotspot-pi)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BIN_PATH="/usr/local/bin/outpost-hotspot-name.sh"
HOOK_PATH="/etc/NetworkManager/dispatcher.d/90-outpost-hotspot-name"
SERVICE_PATH="/etc/systemd/system/outpost-hotspot-name.service"
ENV_PATH="/etc/outpost-hotspot-name.env"
DNSMASQ_DIR="/etc/NetworkManager/dnsmasq-shared.d"
DNSMASQ_CONF="$DNSMASQ_DIR/outpost-hotspot-name.conf"
HOSTS_DIR="/var/lib/outpost-hotspot-name"

usage() { echo "Usage: sudo $0 [--name NAME] [--connection PROFILE]"; }

NAME=""
CON=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            [[ $# -ge 2 && -n "$2" ]] || { usage >&2; exit 1; }
            NAME="$2"; shift 2 ;;
        --name=*) NAME="${1#--name=}"; shift ;;
        --connection)
            [[ $# -ge 2 && -n "$2" ]] || { usage >&2; exit 1; }
            CON="$2"; shift 2 ;;
        --connection=*) CON="${1#--connection=}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    echo "Please run this installer as root (e.g. sudo $0)" >&2
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1 || ! command -v nmcli >/dev/null 2>&1; then
    echo "ERROR: the hotspot name needs systemd and NetworkManager (Raspberry Pi OS Bookworm or newer)." >&2
    exit 1
fi

# keep the current settings unless given
if [[ -f "$ENV_PATH" ]]; then
    [[ -n "$NAME" ]] || NAME="$(sed -n 's/^NAME=//p' "$ENV_PATH" | head -n 1)"
    [[ -n "$CON" ]] || CON="$(sed -n 's/^CONNECTION=//p' "$ENV_PATH" | head -n 1)"
fi
NAME="$(printf '%s' "${NAME:-basecamp}" | tr '[:upper:]' '[:lower:]')"
NAME="${NAME%.local}"
CON="${CON:-pi-hotspot}"
if [[ ! "$NAME" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    echo "ERROR: '$NAME' is not a valid name: letters a-z, digits and '-', at most 63 characters." >&2
    exit 1
fi
if [[ "$CON" == *$'\n'* || "$CON" == *=* ]]; then
    echo "ERROR: '$CON' is not a valid profile name." >&2
    exit 1
fi

if ! command -v avahi-publish >/dev/null 2>&1 || ! systemctl list-unit-files avahi-daemon.service >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
        echo "Installing avahi-daemon and avahi-utils"
        apt-get update -qq
        apt-get install -y avahi-daemon avahi-utils
    else
        echo "ERROR: avahi-daemon and avahi-publish (avahi-utils) are needed; install them first." >&2
        exit 1
    fi
fi
if ! systemctl is-active --quiet avahi-daemon.service; then
    echo "Enabling avahi-daemon.service"
    systemctl enable --now avahi-daemon.service
fi

echo "Installing outpost-hotspot-name.sh to $BIN_PATH"
install -m 755 "$SCRIPT_DIR/outpost-hotspot-name.sh" "$BIN_PATH"

echo "Writing $ENV_PATH (name: $NAME, hotspot profile: $CON)"
printf '# Written by install-hotspot-name.sh; re-run it to change.\nNAME=%s\nCONNECTION=%s\n' "$NAME" "$CON" > "$ENV_PATH.tmp"
chmod 644 "$ENV_PATH.tmp"
mv -f "$ENV_PATH.tmp" "$ENV_PATH"

echo "Installing the mDNS service to $SERVICE_PATH"
install -m 644 "$SCRIPT_DIR/outpost-hotspot-name.service" "$SERVICE_PATH"

echo "Installing the NetworkManager dispatcher hook to $HOOK_PATH"
install -d -m 755 "$(dirname "$HOOK_PATH")"
install -m 755 "$SCRIPT_DIR/90-outpost-hotspot-name" "$HOOK_PATH"

# the hotspot's dnsmasq reads this directory (NetworkManager's shared mode)
# and watches the hosts folder, so a new address needs no restart
echo "Installing the hotspot DNS entry to $DNSMASQ_CONF"
install -d -m 755 "$DNSMASQ_DIR" "$HOSTS_DIR"
dns_changed=true
want="# outpost: answer <name>.local on the hotspot (install-hotspot-name.sh)
hostsdir=$HOSTS_DIR"
if [[ -f "$DNSMASQ_CONF" && "$(cat "$DNSMASQ_CONF")" == "$want" ]]; then
    dns_changed=false
fi
printf '%s\n' "$want" > "$DNSMASQ_CONF"
chmod 644 "$DNSMASQ_CONF"

systemctl daemon-reload
# usually started on demand over D-Bus; make sure it may run
systemctl enable NetworkManager-dispatcher.service >/dev/null 2>&1 || true

"$BIN_PATH" --apply

hotspot_up=false
if nmcli -t -f NAME connection show --active 2>/dev/null | grep -Fx -- "$CON" >/dev/null; then
    hotspot_up=true
fi

cat <<EOF

Installation complete. Devices on the hotspot open outpost at:

    http://$NAME.local:8080      (or the port in outpost's .env)

EOF
if [[ "$hotspot_up" == true && "$dns_changed" == true ]]; then
    cat <<EOF
The hotspot runs now: $NAME.local is announced over mDNS already. The DNS
answer for older devices starts with the hotspot's next start (reboot, or
./manage.sh network hotspot off, then on).

EOF
fi
cat <<EOF
Change the name: sudo $0 --name NAME
Remove it:       sudo $SCRIPT_DIR/uninstall-hotspot-name.sh
EOF
