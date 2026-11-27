#!/usr/bin/env bash
# lib/install.sh - the steps of install.sh. Each step asks through lib/ui.sh
# and writes .env with set_env.

# ------------------------------------------------------------- validators --

valid_port() {
  if [[ ! "$1" =~ ^[0-9]+$ ]] || (( $1 < 1 || $1 > 65535 )); then
    echo "Enter a port between 1 and 65535."
    return 1
  fi
}

valid_pin() {
  if [[ "$1" =~ [[:space:]] ]]; then
    echo "No spaces (or empty for no PIN)."
    return 1
  fi
}

# ------------------------------------------------------------ host check --

# install_host_check - Raspberry Pi firmware device, Podman's state DB and
# API socket, written to .env (detected on every run).
install_host_check() {
  local vcio="" dev group graph_root sock

  # Firmware mailbox vcgencmd needs for voltages and throttle flags; current
  # kernels expose /dev/vcio_gencmd (group video), older ones only /dev/vcio.
  for dev in /dev/vcio_gencmd /dev/vcio; do
    if [[ -c "$dev" ]]; then
      vcio="$dev"
      break
    fi
  done
  if [[ -n "$vcio" ]]; then
    set_env VCIO_DEVICE "$vcio"
    log_ok "Raspberry Pi firmware interface ($vcio)"
    if [[ ! -r "$vcio" || ! -w "$vcio" ]]; then
      group="$(file_group "$vcio")"
      log_warn "$USER cannot access $vcio, so voltage/throttle readings will be missing."
      log_warn "Fix with: sudo usermod -aG $group $USER  (then log out and back in, and re-run ./install.sh)"
    fi
  else
    set_env VCIO_DEVICE /dev/null
    if is_pi; then
      log_warn "No /dev/vcio* device: voltage and throttle readings will be unavailable."
    else
      log_info "Not a Raspberry Pi: no voltage and throttle readings."
    fi
  fi

  # Podman's state DB (containers card, read-only) and its API socket (core
  # starts and stops the modules through it). On macOS both are paths in the
  # Podman machine, which is where core runs.
  graph_root="$(podman info --format '{{.Store.GraphRoot}}' 2>/dev/null || true)"
  set_env PODMAN_GRAPH_ROOT "$graph_root"
  if ! is_macos && [[ -n "$graph_root" && ! -f "$graph_root/db.sql" ]]; then
    log_warn "No $graph_root/db.sql (Podman older than 4.8 or the boltdb backend?): the containers card will be empty."
  fi
  if is_macos; then
    log_ok "Podman API socket (in the Podman machine)"
  elif has_cmd systemctl && systemctl --user enable --now podman.socket >/dev/null 2>&1; then
    log_ok "podman.socket enabled (module start/stop)"
  else
    log_warn "Could not enable podman.socket; modules can't be started from the dashboard until it runs (systemctl --user enable --now podman.socket)."
  fi
  sock="$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null || true)"
  set_env PODMAN_SOCKET "${sock#unix://}"
}

# ---------------------------------------------------------------- basics --

# install_basics - port, who can reach it, control PIN (install.sh
# --advanced; otherwise the defaults: 8080, every device, no PIN).
install_basics() {
  local port bind pin
  port="$(get_env PORT)"; port="${port:-8080}"
  bind="$(get_env BIND_ADDRESS)"; bind="${bind:-0.0.0.0}"
  pin="$(get_env CONTROL_PIN)"
  ui_input "Port for the web app" "$port" valid_port
  set_env PORT "$UI_REPLY"
  ui_select "Who can open it?" "$bind" \
    "0.0.0.0|Every device on the network|LAN, Wi-Fi hotspot (0.0.0.0)" \
    "127.0.0.1|Only this machine|127.0.0.1"
  set_env BIND_ADDRESS "$UI_REPLY"
  ui_input "PIN for control actions: start/stop modules, delete shared data (empty = none)" "$pin" valid_pin
  set_env CONTROL_PIN "$UI_REPLY"
}

# --------------------------------------------------------------- modules --

# install_choose_modules - the modules to build and create (MODULES).
install_choose_modules() {
  local m f state desc entry old
  local -a items=()
  # modules merged into another: say where they went (the old name drops out
  # of MODULES below, installed_modules already ignores it)
  # and preselect their replacement
  local merged=" "
  old="$(get_env MODULES)"
  for entry in $(retired_modules); do
    if [[ ",$old," == *",${entry%%:*},"* ]]; then
      if [[ "${entry#*:}" == core ]]; then
        ui_note "${entry%%:*} is now built in: always there, nothing to select."
      else
        ui_note "The ${entry%%:*} module is now part of ${entry#*:}; keep ${entry#*:} selected to use it."
        merged+="${entry#*:} "
      fi
    fi
  done
  for m in $(all_modules); do
    f="$ROOT_DIR/apps/$m/module.json"
    if is_installed "$m" || [[ "$merged" == *" $m "* ]]; then state=on; else state=off; fi
    desc="$(manifest_field "$f" description)"
    items+=("$m|$(module_label "$m")|$desc|$state")
  done
  ui_note "Always included: home, Files, Board, Supplies, System, Logs, Info, Settings, Diagnostics."
  ui_note "Installed modules are switched on and off in the web app."
  ui_multiselect "Which modules should be installed?" "${items[@]}"
  set_env MODULES "$UI_REPLY"
}

# --------------------------------------------------------------- summary --

# install_summary - where to open it, the modules, where the data lives.
install_summary() {
  local var ip
  load_env
  ip="$(lan_ip)"
  printf '\n' >&2
  printf '  %-22s %s\n' "Web app" "http://localhost:${PORT}" >&2
  if [[ -n "$ip" && "${BIND_ADDRESS}" != 127.0.0.1 ]]; then
    printf '  %-22s %s\n' "" "http://${ip}:${PORT}" >&2
  fi
  printf '  %-22s %s\n' "Modules" "${MODULES:-none}" >&2
  printf '  %-22s %s\n' "Control PIN" "${CONTROL_PIN:+set}${CONTROL_PIN:-none (./install.sh --advanced)}" >&2
  for var in $(active_dir_vars); do
    printf '  %-22s %s\n' "$var" "${!var:-}" >&2
  done
  printf '\n' >&2
}
