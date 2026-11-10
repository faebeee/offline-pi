#!/usr/bin/env bash
# lib/serial.sh - pick the Meshtastic node's serial device and check access.

# list_serial_devices - stable by-id paths first, raw ttyACM/ttyUSB as fallback.
list_serial_devices() {
  local found=false dev
  for dev in /dev/serial/by-id/*; do
    [[ -e "$dev" ]] || continue
    printf '%s\n' "$dev"
    found=true
  done
  if [[ "$found" == false ]]; then
    for dev in /dev/ttyACM* /dev/ttyUSB*; do
      [[ -e "$dev" ]] && printf '%s\n' "$dev"
    done
  fi
  return 0
}

# choose_serial_device CURRENT - print the chosen device path. Lists what is
# plugged in and asks; defaults to CURRENT if it is still present.
choose_serial_device() {
  local current="$1" dev
  local -a devices=() items=()
  read_lines devices list_serial_devices
  if [[ ${#devices[@]} -eq 0 ]]; then
    log_error "No serial device found. Plug the Meshtastic node in by USB (data cable, not charge-only) and re-run ./install.sh."
    return 1
  fi
  for dev in "${devices[@]}"; do
    if [[ "$dev" == "$current" ]]; then
      items+=("$dev|${dev##*/}|current")
    else
      items+=("$dev|${dev##*/}|")
    fi
  done
  ui_select "Mesh: which one is the Meshtastic node?" "$current" "${items[@]}"
  printf '%s\n' "$UI_REPLY"
}

# check_serial_access DEVICE - the container inherits the host user's groups
# (keep-groups), so the user itself must be able to open the device.
check_serial_access() {
  local dev="$1" real group
  real="$(readlink -f "$dev")"
  if [[ -r "$real" && -w "$real" ]]; then
    log_ok "$USER can access $dev"
    return 0
  fi
  group="$(file_group "$real")"
  log_warn "$USER cannot open $real (owned by group '$group')."
  if ui_confirm "Add $USER to the '$group' group now (sudo)?" y; then
    sudo usermod -aG "$group" "$USER"
    log_warn "Added. Log out and back in (or reboot) so the new group applies, then re-run ./install.sh."
    exit 1
  fi
  log_warn "Without access the app will show 'radio disconnected'. Fix with: sudo usermod -aG $group $USER"
}

# warn_modemmanager - ModemManager probes new ttyACM devices as modems and can
# grab the node's port for a while after it is plugged in.
warn_modemmanager() {
  if has_cmd systemctl && systemctl is-active --quiet ModemManager 2>/dev/null; then
    log_warn "ModemManager is running and may interfere with the node's serial port."
    log_warn "If the radio keeps disconnecting: sudo systemctl disable --now ModemManager"
  fi
}
