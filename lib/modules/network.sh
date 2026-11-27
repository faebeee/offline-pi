#!/usr/bin/env bash
# lib/modules/network.sh - devices on the Pi's Wi-Fi hotspot (apps/network).
#
# The container (rootless) lists the devices and keeps the block list; the
# host helper host/network-guard (root, systemd) enforces it with nftables
# and switches the hotspot on and off when the screen asks.
# The configure hook offers to install or re-point that helper, because it
# needs the absolute NETWORK_DATA_DIR and sudo.

NETWORK_GUARD_ENV="/etc/outpost-network-guard.env"

network_configure() {
  local new leases guard_dir
  # set by install.sh's storage step (lib/storage.sh)
  new="$(get_env NETWORK_DATA_DIR)"

  # the leases folder is bind-mounted, so it has to exist
  leases="$(get_env NETWORK_LEASES_PATH)"; leases="${leases:-/var/lib/NetworkManager}"
  if is_macos; then
    ui_note "Network: on macOS there is no hotspot to watch (the screen stays empty)."
    set_env NETWORK_LEASES_PATH "$new"
    return 0
  fi
  if [[ ! -d "$leases" ]]; then
    log_warn "Network: $leases not found (no NetworkManager?); devices are listed without IP and hostname."
    set_env NETWORK_LEASES_PATH "$new"
  fi

  # the host helper that makes blocking work
  guard_dir=""
  [[ -r "$NETWORK_GUARD_ENV" ]] && guard_dir="$(sed -n 's/^DATA_DIR=//p' "$NETWORK_GUARD_ENV" | head -n 1)"
  if [[ "$guard_dir" == "$(cd "$new" && pwd -P)" ]]; then
    return 0
  fi
  if [[ -n "$guard_dir" ]]; then
    ui_note "Network: the blocking helper still watches $guard_dir."
  else
    ui_note "Network: blocking devices and the hotspot switch need a small helper on the host (root, systemd, nftables)."
  fi
  # unattended (--yes, e.g. update.sh): no sudo password prompt
  if [[ "${UI_ASSUME_YES:-}" != true ]] && ui_confirm "Network: install it now (asks for your sudo password)?" y; then
    if sudo "$ROOT_DIR/host/network-guard/install-network-guard.sh" --data-dir "$new"; then
      return 0
    fi
    log_warn "Network: the helper was not installed; blocking stays without effect."
  fi
  log_warn "Install it later: sudo $ROOT_DIR/host/network-guard/install-network-guard.sh"
}

network_usage() {
  cat <<USAGE
  network status              hotspot interface, devices, blocking helper
  network clients             every device seen: MAC, IP, signal, vendor
  network block MAC [NOTE]    cut a device off the hotspot
  network unblock MAC         let it back in
  network hotspot on|off      switch the Wi-Fi hotspot (through the helper)
  network install-guard       (re)install the blocking helper (sudo)
USAGE
}

network_manage() {
  case "${1:-}" in
    status | clients | block | unblock | hotspot)
      [[ "$1" == block || "$1" == unblock ]] && [[ -z "${2:-}" ]] && return 2
      [[ "$1" == hotspot ]] && [[ "${2:-}" != on && "${2:-}" != off ]] && return 2
      if [[ "$(podman inspect -f '{{.State.Running}}' outpost-network 2>/dev/null)" != true ]]; then
        log_error "Network is not running. Start it on the dashboard."
        exit 1
      fi
      podman exec outpost-network python -m app.cli "$@"
      ;;
    install-guard)
      load_env
      sudo "$ROOT_DIR/host/network-guard/install-network-guard.sh" --data-dir "${NETWORK_DATA_DIR:-./data/network}"
      ;;
    *) return 2 ;;
  esac
}
