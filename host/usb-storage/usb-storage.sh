# Shared by install-usb-storage.sh and uninstall-usb-storage.sh (sourced).

FSTAB_MARKER="# outpost-usb-storage (host/usb-storage, do not edit this line)"
DISABLED_PREFIX="#outpost-usb-storage-disabled# "
UDEV_RULE="/etc/udev/rules.d/99-outpost-usb-storage.rules"

die() { echo "ERROR: $*" >&2; exit 1; }

require_root() {
    [[ "$(uname -s)" == "Linux" ]] || die "This is for Linux (Raspberry Pi OS)."
    [[ $EUID -eq 0 ]] || die "Please run it as root (e.g. sudo $1)"
}

# Partitions (or whole disks) with a file system on a USB disk, one per line.
usb_partitions() {
    local name type fstype disk tran
    lsblk -rpno NAME | while read -r name; do
        type="$(lsblk -dno TYPE "$name")"
        fstype="$(lsblk -dno FSTYPE "$name")"
        case "$type" in part|disk) ;; *) continue ;; esac
        [[ -n "$fstype" && "$fstype" != "swap" ]] || continue
        disk="$name"
        [[ "$type" == "part" ]] && disk="/dev/$(lsblk -dno PKNAME "$name")"
        tran="$(lsblk -dno TRAN "$disk" 2>/dev/null || true)"
        [[ "$tran" == "usb" ]] && echo "$name"
    done
    return 0
}

describe_device() {
    local size fstype label uuid
    size="$(lsblk -dno SIZE "$1" | tr -d ' ')"
    fstype="$(lsblk -dno FSTYPE "$1")"
    label="$(lsblk -dno LABEL "$1")"
    uuid="$(lsblk -dno UUID "$1")"
    printf '%s  %s  %s' "$1" "$size" "$fstype"
    [[ -n "$label" ]] && printf '  label %s' "$label"
    [[ -n "$uuid" ]] && printf '  UUID %s' "$uuid"
    printf '\n'
}

# fstab options for a file system: mount at boot without blocking it when
# the drive is missing (nofail, short timeout), but before local-fs.target
# when it is there, so outpost's containers start after it.
mount_options() {
    local fs="$1" uid="$2" gid="$3"
    local common="nofail,noatime,x-systemd.before=local-fs.target,x-systemd.device-timeout=10s"
    case "$fs" in
        exfat|vfat|ntfs) echo "defaults,$common,uid=$uid,gid=$gid,umask=0022" ;;
        ext2|ext3|ext4|xfs|btrfs) echo "defaults,$common" ;;
        *) return 1 ;;
    esac
}

# fstab lines without our entry (the marker line and the line after it).
strip_managed_entries() {
    awk -v marker="$FSTAB_MARKER" '
        skip { skip = 0; next }
        $0 == marker { skip = 1; next }
        { print }
    '
}

# Comment out other entries that mount on the same point.
disable_foreign_entries() {
    awk -v mp="$1" -v prefix="$DISABLED_PREFIX" '
        $0 !~ /^[[:space:]]*#/ && $2 == mp { print prefix $0; next }
        { print }
    '
}

# Other (not ours) active fstab entries for a mount point.
foreign_entries_for() {
    strip_managed_entries < /etc/fstab | awk -v mp="$1" '
        $0 !~ /^[[:space:]]*#/ && $2 == mp { print }
    '
}
