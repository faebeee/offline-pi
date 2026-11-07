#!/usr/bin/env bash
# lib/common.sh - log helpers and the compose wrapper shared by the scripts.

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

# compose - run the available podman compose backend with the given args.
# Prefers the built-in `podman compose` subcommand, falls back to the
# standalone `podman-compose` binary.
compose() {
  if podman compose version >/dev/null 2>&1; then
    podman compose "$@"
  else
    podman-compose "$@"
  fi
}

apt_install() {
  log_info "Installing package(s): $*"
  sudo apt-get update -qq
  sudo apt-get install -y "$@"
}

ensure_podman() {
  if has_cmd podman; then
    log_ok "podman found"
  else
    log_warn "podman not found."
    read -r -p "Install Podman now via apt? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      apt_install podman
    else
      log_error "Podman is required. Install it manually and re-run ./install.sh"
      exit 1
    fi
  fi

  if podman compose version >/dev/null 2>&1; then
    log_ok "podman compose found"
  elif has_cmd podman-compose; then
    log_ok "podman-compose found"
  else
    log_warn "No compose backend found for podman."
    read -r -p "Install podman-compose now via apt? [y/N] " reply
    if [[ "$reply" =~ ^[Yy]$ ]]; then
      apt_install podman-compose
    else
      log_error "'podman compose' (or podman-compose) is required. Install it manually and re-run ./install.sh"
      exit 1
    fi
  fi
}

# ensure_autostart - rootless Podman only restarts containers after a reboot
# through the user's podman-restart.service (restart-policy=always only), and
# only if the user lingers (has a systemd user manager without logging in).
ensure_autostart() {
  if ! has_cmd systemctl; then
    return
  fi
  if systemctl --user enable podman-restart.service >/dev/null 2>&1; then
    log_ok "podman-restart.service enabled (containers come back after reboot)"
  else
    log_warn "Could not enable podman-restart.service; containers won't auto-start after a reboot."
  fi
  if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
    if loginctl enable-linger "$USER" 2>/dev/null || sudo loginctl enable-linger "$USER"; then
      log_ok "Enabled lingering for $USER"
    else
      log_warn "Run 'sudo loginctl enable-linger $USER' so containers start at boot without a login."
    fi
  fi
}

# set_env KEY VALUE - replace (or append) KEY=VALUE in $ENV_FILE.
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}
