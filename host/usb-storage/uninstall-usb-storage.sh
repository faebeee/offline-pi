#!/usr/bin/env bash
#
# uninstall-usb-storage.sh
#
# Reverses install-usb-storage.sh: removes outpost's fstab entry and udev
# rule and restores fstab entries it had commented out. The drive stays
# mounted until it is unplugged or the Pi reboots; nothing on it is deleted.
#
# Usage: sudo ./uninstall-usb-storage.sh [--yes]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=host/usb-storage/usb-storage.sh
source "$SCRIPT_DIR/usb-storage.sh"

ASSUME_YES=false
case "${1:-}" in
    --yes|-y) ASSUME_YES=true ;;
    "") ;;
    *) die "Usage: sudo $0 [--yes]" ;;
esac

require_root "$0"

entry="$(awk -v marker="$FSTAB_MARKER" 'found { print; exit } $0 == marker { found = 1 }' /etc/fstab)"
disabled="$(grep -F "$DISABLED_PREFIX" /etc/fstab || true)"

if [[ -z "$entry" && -z "$disabled" && ! -f "$UDEV_RULE" ]]; then
    echo "Nothing to remove: no outpost USB storage entry found."
    exit 0
fi

echo "This removes:"
[[ -n "$entry" ]] && echo "  fstab entry: $entry"
[[ -f "$UDEV_RULE" ]] && echo "  udev rule:   $UDEV_RULE"
if [[ -n "$disabled" ]]; then
    echo "and restores these fstab entries:"
    printf '%s\n' "$disabled" | sed "s|^$DISABLED_PREFIX|  |"
fi
echo "Data on the drive is not touched."
echo

if ! $ASSUME_YES; then
    read -r -p "Continue? [y/N] " answer
    case "$answer" in [yY]*) ;; *) echo "Nothing changed."; exit 0 ;; esac
fi

backup="/etc/fstab.outpost-usb.$(date +%Y%m%d%H%M%S).bak"
cp -p /etc/fstab "$backup"

tmp="$(mktemp)"
strip_managed_entries < /etc/fstab \
    | awk -v prefix="$DISABLED_PREFIX" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1); next } { print }' \
    > "$tmp"
cat "$tmp" > /etc/fstab
rm -f "$tmp"
echo "Updated /etc/fstab (backup: $backup)"

rm -f "$UDEV_RULE"
systemctl daemon-reload
udevadm control --reload

echo "Done. The drive stays mounted until it is unplugged or the Pi reboots."
