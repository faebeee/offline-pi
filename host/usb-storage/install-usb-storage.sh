#!/usr/bin/env bash
#
# install-usb-storage.sh
#
# Mounts a USB drive (stick or SSD) automatically: at every boot and
# whenever it is plugged in. outpost's data directories (maps, library)
# can then live on it.
#
# It writes one /etc/fstab entry by UUID (nofail, so the Pi still boots
# without the drive) and one udev rule that mounts the drive when it is
# plugged in later. Undo it with uninstall-usb-storage.sh.
#
# Usage: sudo ./install-usb-storage.sh [--device /dev/sda1] [--mount /media/Data]
#                                      [--user pi] [--yes]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=host/usb-storage/usb-storage.sh
source "$SCRIPT_DIR/usb-storage.sh"

DEVICE=""
MOUNT_POINT=""
OWNER="${SUDO_USER:-}"
ASSUME_YES=false

usage() {
    sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --device) DEVICE="${2:-}"; shift 2 ;;
        --mount) MOUNT_POINT="${2:-}"; shift 2 ;;
        --user) OWNER="${2:-}"; shift 2 ;;
        --yes|-y) ASSUME_YES=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "Unknown option: $1 (see --help)" ;;
    esac
done

require_root "$0"

# --- Which drive -----------------------------------------------------------

if [[ -z "$DEVICE" ]]; then
    candidates="$(usb_partitions)"
    count="$(printf '%s' "$candidates" | grep -c . || true)"
    if [[ "$count" -eq 0 ]]; then
        die "No USB drive with a file system found. Plug it in, or pass --device."
    elif [[ "$count" -gt 1 ]]; then
        echo "Several USB partitions found:" >&2
        printf '%s\n' "$candidates" | while read -r name; do
            echo "  $(describe_device "$name")" >&2
        done
        die "Choose one with --device <path>."
    fi
    DEVICE="$candidates"
fi

[[ -b "$DEVICE" ]] || die "$DEVICE is not a block device."

UUID="$(blkid -s UUID -o value "$DEVICE" || true)"
FSTYPE="$(blkid -s TYPE -o value "$DEVICE" || true)"
LABEL="$(blkid -s LABEL -o value "$DEVICE" || true)"
[[ -n "$UUID" ]] || die "$DEVICE has no file system UUID. Format it first (exFAT or ext4)."

if [[ -z "$MOUNT_POINT" ]]; then
    name="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_')"
    MOUNT_POINT="/media/${name:-outpost-usb}"
fi
case "$MOUNT_POINT" in
    /media/?*|/mnt/?*) ;;
    *) die "Mount point must be under /media or /mnt (got '$MOUNT_POINT')." ;;
esac

[[ -n "$OWNER" ]] || die "Cannot tell which user owns the files. Pass --user <name>."
OWNER_UID="$(id -u "$OWNER")" || die "Unknown user '$OWNER'."
OWNER_GID="$(id -g "$OWNER")"

OPTIONS="$(mount_options "$FSTYPE" "$OWNER_UID" "$OWNER_GID")" \
    || die "File system '$FSTYPE' is not supported. Use exFAT, FAT32, NTFS or ext4."
FSTAB_TYPE="$FSTYPE"
[[ "$FSTYPE" == "ntfs" ]] && FSTAB_TYPE="ntfs3"

UNIT="$(systemd-escape -p --suffix=mount "$MOUNT_POINT")"

cat <<EOF

Drive:        $(describe_device "$DEVICE")
Mount point:  $MOUNT_POINT
Owner:        $OWNER (uid $OWNER_UID)
fstab entry:  UUID=$UUID $MOUNT_POINT $FSTAB_TYPE $OPTIONS 0 0
udev rule:    $UDEV_RULE (mounts it when plugged in)

EOF

other="$(foreign_entries_for "$MOUNT_POINT")"
if [[ -n "$other" ]]; then
    echo "These existing fstab entries use $MOUNT_POINT and will be commented out"
    echo "(uninstall-usb-storage.sh restores them):"
    printf '  %s\n' "$other"
    echo
fi

if ! $ASSUME_YES; then
    read -r -p "Continue? [Y/n] " answer
    case "$answer" in [nN]*) echo "Nothing changed."; exit 0 ;; esac
fi

# --- fstab -----------------------------------------------------------------

backup="/etc/fstab.outpost-usb.$(date +%Y%m%d%H%M%S).bak"
cp -p /etc/fstab "$backup"

tmp="$(mktemp)"
strip_managed_entries < /etc/fstab | disable_foreign_entries "$MOUNT_POINT" > "$tmp"
{
    printf '%s\n' "$FSTAB_MARKER"
    printf 'UUID=%s  %s  %s  %s  0  0\n' "$UUID" "$MOUNT_POINT" "$FSTAB_TYPE" "$OPTIONS"
} >> "$tmp"

if ! findmnt --verify --tab-file "$tmp" >/dev/null 2>&1; then
    findmnt --verify --tab-file "$tmp" >&2 || true
    rm -f "$tmp"
    die "The new fstab does not verify; /etc/fstab is unchanged."
fi
cat "$tmp" > /etc/fstab
rm -f "$tmp"
echo "Updated /etc/fstab (backup: $backup)"

# --- udev: mount when plugged in ------------------------------------------

cat > "$UDEV_RULE" <<EOF
# Written by outpost host/usb-storage: mount the drive when it is plugged in.
SUBSYSTEM=="block", ENV{ID_FS_UUID}=="$UUID", ENV{SYSTEMD_WANTS}+="$UNIT"
EOF
chmod 644 "$UDEV_RULE"
echo "Wrote $UDEV_RULE"

systemctl daemon-reload
udevadm control --reload

# --- Mount it now ----------------------------------------------------------

mkdir -p "$MOUNT_POINT"
current="$(findmnt -rno TARGET "$DEVICE" 2>/dev/null | head -n 1 || true)"
if [[ -n "$current" && "$current" != "$MOUNT_POINT" ]]; then
    echo "Unmounting $DEVICE from $current"
    umount "$DEVICE"
fi
systemctl restart "$UNIT"
findmnt "$MOUNT_POINT" >/dev/null || die "Mounting failed: journalctl -u $UNIT"

# Linux file systems keep owners: give the user the root folder of the drive.
case "$FSTYPE" in
    ext2|ext3|ext4|xfs|btrfs) chown "$OWNER_UID:$OWNER_GID" "$MOUNT_POINT" ;;
esac
runuser -u "$OWNER" -- mkdir -p "$MOUNT_POINT/outpost"

df -h "$MOUNT_POINT" | tail -n 1 | awk '{print "Mounted: " $2 " total, " $4 " free"}'

cat <<EOF

Done. $MOUNT_POINT is mounted now, at every boot and whenever the drive
is plugged in. To keep maps and library on it, run ./install.sh in the
outpost folder and answer:

    MAPS_DATA_DIR          $MOUNT_POINT/outpost/maps
    MAPS_ASSETS_DIR        $MOUNT_POINT/outpost/maps-assets
    KNOWLEDGE_CONTENT_DIR  $MOUNT_POINT/outpost/knowledge

EOF
