#!/usr/bin/env bash
# lib/common.sh - log helpers, the compose wrapper and .env helpers shared by
# the root scripts. Expects ROOT_DIR (the repo checkout) to be set.

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

PROJECT_NAME="offline-pi"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

# compose - run the available podman compose backend with the given args on
# the root compose.yml, always as project "offline-pi" (independent of the
# checkout's directory name). Prefers the built-in `podman compose`
# subcommand, falls back to the standalone `podman-compose` binary.
compose() {
  local -a args=(-p "$PROJECT_NAME" -f "$ROOT_DIR/compose.yml")
  [[ -f "$ENV_FILE" ]] && args+=(--env-file "$ENV_FILE")
  if podman compose version >/dev/null 2>&1; then
    podman compose "${args[@]}" "$@"
  else
    podman-compose "${args[@]}" "$@"
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

# get_env KEY - value of KEY in .env (read, not sourced), empty if unset.
get_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1
}

# load_env - source .env into the current shell.
load_env() {
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}

# sync_ui DEST - copy the shared Outpost UI package (ui/) into DEST, which a
# service bundles or serves. Run before every build.
sync_ui() {
  local sync="$ROOT_DIR/ui/sync.sh"
  if [[ ! -f "$sync" ]]; then
    log_error "Shared UI package not found at $sync (run from a full offline-pi checkout)."
    exit 1
  fi
  bash "$sync" "$1"
}
