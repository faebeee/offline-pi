#!/usr/bin/env bash
# lib/modules/network.sh - devices on the Pi's Wi-Fi hotspot (apps/network).
#
# The container (rootless) lists the devices and keeps the block list; the
# host helper host/network-guard (root, systemd) enforces it with nftables
# and switches the hotspot on and off when install.sh or
# ./manage.sh network hotspot asks (never the web app).
# The configure hook offers to install or re-point that helper, because it
# needs the absolute NETWORK_DATA_DIR and sudo.

NETWORK_GUARD_ENV="/etc/outpost-network-guard.env"

network_configure() {
  local new leases
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

  network_ensure_guard "$new"
  network_ask_hotspot "$new"
}

# network_guard_current - the helper installed on the host is this
# version's (an older one may reject what install.sh asks of it, e.g. a
# hotspot on a chosen interface).
network_guard_current() {
  local f
  for f in outpost-network-guard.sh outpost-network-hotspot.sh; do
    cmp -s "$ROOT_DIR/host/network-guard/$f" "/usr/local/bin/$f" || return 1
  done
}

# network_ensure_guard DATA_DIR - the host helper that makes blocking work
# and switches the hotspot: offer to install it, re-point it to DATA_DIR or
# update it to this version.
network_ensure_guard() {
  local new="$1" guard_dir=""
  [[ -r "$NETWORK_GUARD_ENV" ]] && guard_dir="$(sed -n 's/^DATA_DIR=//p' "$NETWORK_GUARD_ENV" | head -n 1)"
  if [[ "$guard_dir" == "$(cd "$new" && pwd -P)" ]]; then
    network_guard_current && return 0
    ui_note "Network: the helper on the host is from an older version of outpost."
  elif [[ -n "$guard_dir" ]]; then
    ui_note "Network: the blocking helper still watches $guard_dir."
  else
    ui_note "Network: blocking devices and switching the hotspot need a small helper on the host (root, systemd, nftables)."
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

# The hotspot is switched here and with ./manage.sh network hotspot on|off,
# never from the web app. The choice is applied at the very end of
# install.sh (network_post_start): switching drops everyone on the hotspot,
# maybe the SSH session running the installer.
NETWORK_HOTSPOT_CHOICE=""
NETWORK_HOTSPOT_UNIT="/etc/systemd/system/outpost-network-hotspot.path"

# network_wifi_ifaces - this host's Wi-Fi interfaces, one per line as
# "name|state" (state: hotspot, connected to <SSID>, not connected).
network_wifi_ifaces() {
  local out line dev type state con
  if has_cmd nmcli && out="$(nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status 2>/dev/null)"; then
    while IFS=: read -r dev type state con; do
      [[ "$type" == wifi ]] || continue
      case "$state" in
        connected*) state="connected${con:+ to $con}" ;;
        *) state="not connected" ;;
      esac
      printf '%s|%s\n' "$dev" "$state"
    done <<<"$out"
    return 0
  fi
  # without NetworkManager: iw lists every wireless interface
  out="$(iw dev 2>/dev/null || true)"
  dev=""
  while IFS= read -r line; do
    case "$line" in
      *Interface\ *) dev="${line##*Interface }" ;;
      *type\ AP*) [[ -n "$dev" ]] && printf '%s|hotspot\n' "$dev"; dev="" ;;
      *type\ *) [[ -n "$dev" ]] && printf '%s|\n' "$dev"; dev="" ;;
    esac
  done <<<"$out"
}

# network_ap_iface - the interface the hotspot runs on now (empty when off).
network_ap_iface() {
  local out line dev=""
  out="$(iw dev 2>/dev/null || true)"
  while IFS= read -r line; do
    case "$line" in
      *Interface\ *) dev="${line##*Interface }" ;;
      *type\ AP*) printf '%s\n' "$dev"; return 0 ;;
    esac
  done <<<"$out"
  return 0
}

# network_ask_hotspot DATA_DIR - on, off, or leave it (the default, also
# with --yes, so update.sh never switches it); for on (and to tell the
# Network screen which interface to watch) the Wi-Fi interface.
network_ask_hotspot() {
  local dir="$1" now="off" ap iface entry name state def
  local -a ifaces=() items=()
  if [[ ! -f "$NETWORK_HOTSPOT_UNIT" ]]; then
    ui_note "Network: switching the hotspot needs the helper above; without it the hotspot stays as it is."
    return 0
  fi
  ap="$(network_ap_iface)"
  [[ -n "$ap" ]] && now="on (${ap})"
  ui_select "Network: Wi-Fi hotspot (now $now)" keep \
    "keep|Leave it as it is|now $now" \
    "on|On|phones and laptops can join the Pi's own Wi-Fi" \
    "off|Off|the Pi stays on its usual Wi-Fi as a client"
  local choice="$UI_REPLY"
  NETWORK_HOTSPOT_CHOICE=""
  if [[ "$choice" == off ]]; then
    [[ -n "$ap" ]] && network_set_choice off
    return 0
  fi
  # left on as it is: its interface is known, nothing to ask
  if [[ "$choice" == keep && -n "$ap" ]]; then
    set_env NETWORK_IFACE "$ap"
    return 0
  fi

  # which interface: the hotspot's (and the one the Network screen watches)
  read_lines ifaces network_wifi_ifaces
  if [[ ${#ifaces[@]} -eq 0 ]]; then
    [[ "$choice" == on ]] && log_warn "Network: no Wi-Fi interface found (nmcli device status); the hotspot can't be switched on."
    return 0
  fi
  def="$(get_env NETWORK_IFACE)"; def="${def:-$ap}"; def="${def:-${ifaces[0]%%|*}}"
  if [[ ${#ifaces[@]} -eq 1 ]]; then
    iface="${ifaces[0]%%|*}"
    ui_note "Network: the hotspot uses $iface, the only Wi-Fi interface."
  else
    for entry in "${ifaces[@]}"; do
      name="${entry%%|*}"; state="${entry#*|}"
      [[ "$name" == "$ap" ]] && state="hotspot"
      items+=("$name|$name|$state")
    done
    ui_select "Network: the hotspot's Wi-Fi interface" "$def" ${items[@]+"${items[@]}"}
    iface="$UI_REPLY"
  fi
  set_env NETWORK_IFACE "$iface"
  if [[ "$choice" == on && "$iface" != "$ap" ]]; then
    NETWORK_HOTSPOT_CHOICE="on $iface"
    ui_note "Network: the hotspot starts on $iface at the end of the install ($iface is also its interface at boot)."
    if [[ -n "${SSH_CONNECTION:-}" ]]; then
      ui_note "If you are connected over that Wi-Fi interface, this session ends then; outpost keeps running."
    fi
  fi
}

# network_set_choice off - remember switching off (applied at the end).
network_set_choice() {
  NETWORK_HOTSPOT_CHOICE="$1"
  ui_note "Network: the hotspot is switched off at the end of the install."
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    ui_note "If you are connected through the hotspot, this session ends then; outpost keeps running."
  fi
}

# network_post_start - apply the hotspot choice, last of all (see above):
# the host helper (outpost-network-hotspot.path) switches it within seconds.
network_post_start() {
  [[ -n "$NETWORK_HOTSPOT_CHOICE" ]] || return 0
  local dir
  dir="$(get_env NETWORK_DATA_DIR)"
  if printf '%s\n' "$NETWORK_HOTSPOT_CHOICE" >"$dir/hotspot.request"; then
    case "$NETWORK_HOTSPOT_CHOICE" in
      off) log_ok "Network: switching the Wi-Fi hotspot off (takes a few seconds)" ;;
      *) log_ok "Network: starting the Wi-Fi hotspot on ${NETWORK_HOTSPOT_CHOICE#on } (takes a few seconds)" ;;
    esac
  else
    log_warn "Network: could not switch the hotspot; try ./manage.sh network hotspot ${NETWORK_HOTSPOT_CHOICE%% *}"
  fi
}

network_usage() {
  cat <<USAGE
  network status              hotspot interface, devices, blocking helper
  network clients             every device seen: MAC, IP, signal, vendor
  network block MAC [NOTE]    cut a device off the hotspot
  network unblock MAC         let it back in
  network hotspot on|off      switch the Wi-Fi hotspot (through the helper; not in the web app)
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
