#!/usr/bin/env bash
# lib/autostart.sh - start outpost when the host boots, through a systemd
# user unit (~/.config/systemd/user/outpost.service). With lingering
# (ensure_linger) the user's systemd starts at boot without a login, runs
# `start.sh --boot` (starts the existing core container; core starts the
# modules switched on) and `stop.sh` at shutdown. Linux only: on macOS the
# Podman machine has to be started by hand anyway.

AUTOSTART_UNIT="outpost.service"

autostart_unit_file() {
  printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/$AUTOSTART_UNIT"
}

autostart_supported() {
  ! is_macos && has_cmd systemctl && systemctl --user show-environment >/dev/null 2>&1
}

autostart_enabled() {
  autostart_supported && [[ "$(systemctl --user is-enabled "$AUTOSTART_UNIT" 2>/dev/null)" == enabled ]]
}

# autostart_enable - write the unit (for this checkout) and enable it.
autostart_enable() {
  local file
  if ! autostart_supported; then
    log_info "Starting at boot needs systemd (not on macOS): after a restart run ./start.sh."
    return 0
  fi
  file="$(autostart_unit_file)"
  mkdir -p "$(dirname "$file")"
  cat >"$file" <<UNIT
# Written by outpost's install.sh ($ROOT_DIR). Remove with:
#   ./manage.sh autostart off
[Unit]
Description=outpost: start the offline app at boot
Wants=podman.socket
After=podman.socket

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$ROOT_DIR/start.sh --boot
ExecStop=$ROOT_DIR/stop.sh
TimeoutStartSec=20min

[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  if systemctl --user enable "$AUTOSTART_UNIT" >/dev/null 2>&1; then
    log_ok "outpost starts by itself when this machine boots"
  else
    log_warn "Could not enable $AUTOSTART_UNIT; after a reboot run ./start.sh."
  fi
}

# autostart_disable - disable and remove the unit (nothing else is touched).
autostart_disable() {
  local file
  autostart_supported || return 0
  file="$(autostart_unit_file)"
  systemctl --user disable "$AUTOSTART_UNIT" >/dev/null 2>&1 || true
  rm -f "$file"
  systemctl --user daemon-reload
  log_ok "outpost no longer starts at boot; after a reboot run ./start.sh."
}
