#!/usr/bin/env bash
# lib/deps.sh - dependency detection & installation helpers
set -euo pipefail

OK_MARK="✔"
FAIL_MARK="✘"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m%s\033[0m %s\n' "$OK_MARK" "$*"; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l|armv6l) echo "armhf" ;;
    *) echo "unknown" ;;
  esac
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
      log_ok "Podman installed."
    else
      log_error "Podman is required. Install it manually and re-run install.sh"
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
      log_ok "podman-compose installed."
    else
      log_error "'podman compose' (or podman-compose) is required. Install it manually and re-run install.sh"
      exit 1
    fi
  fi
}

ensure_aria2() {
  if has_cmd aria2c; then
    log_ok "aria2c found"
    return
  fi
  log_warn "aria2c not found (needed for resumable, checksum-verified downloads)."
  apt_install aria2
}

ensure_xmlstarlet() {
  if has_cmd xmlstarlet; then
    log_ok "xmlstarlet found"
    return
  fi
  log_warn "xmlstarlet not found (needed to parse the Kiwix catalog)."
  apt_install xmlstarlet
}

ensure_gum() {
  if has_cmd gum; then
    log_ok "gum found"
    return
  fi
  log_warn "gum not found (needed for the interactive topic picker)."

  if has_cmd apt-get; then
    log_info "Attempting install via Charm's apt repository..."
    sudo mkdir -p /etc/apt/keyrings
    if curl -fsSL https://repo.charm.sh/apt/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/charm.gpg 2>/dev/null; then
      echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" | sudo tee /etc/apt/sources.list.d/charm.list >/dev/null
      sudo apt-get update -qq
      if sudo apt-get install -y gum; then
        log_ok "gum installed via apt"
        return
      fi
    fi
  fi

  log_warn "Falling back to downloading the gum binary directly."
  local arch gum_arch tmpdir version url
  arch="$(detect_arch)"
  case "$arch" in
    amd64) gum_arch="x86_64" ;;
    arm64) gum_arch="arm64" ;;
    armhf) gum_arch="armv7" ;;
    *) log_error "Unsupported architecture for gum: $(uname -m)"; exit 1 ;;
  esac
  version="0.14.5"
  tmpdir="$(mktemp -d)"
  url="https://github.com/charmbracelet/gum/releases/download/v${version}/gum_${version}_Linux_${gum_arch}.tar.gz"
  log_info "Downloading $url"
  curl -fsSL "$url" -o "$tmpdir/gum.tar.gz"
  tar -xzf "$tmpdir/gum.tar.gz" -C "$tmpdir"
  sudo install -m 0755 "$tmpdir"/gum_*/gum /usr/local/bin/gum
  rm -rf "$tmpdir"
  log_ok "gum installed to /usr/local/bin/gum"
}

ensure_all_deps() {
  ensure_podman
  ensure_aria2
  ensure_xmlstarlet
  ensure_gum
}

# ensure_autostart - rootless Podman only restarts containers after a reboot
# through the user's podman-restart.service (restart-policy=always only), and
# only if the user lingers (has a systemd user manager without logging in).
ensure_autostart() {
  if ! command -v systemctl >/dev/null 2>&1; then
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
