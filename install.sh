#!/usr/bin/env bash
# install.sh - set up offline-pi: check dependencies, write .env, choose and
# configure the modules, build the images, then start everything. Safe to
# re-run: it is also how you add/remove modules, move data to an SSD (every
# *_DIR is re-asked, defaulting to the current value) or reconfigure a module.
#
# Also adopts an installation of the old per-app layout (apps/*/.env), see
# lib/migrate.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/storage.sh
source "$ROOT_DIR/lib/storage.sh"
# shellcheck source=lib/serial.sh
source "$ROOT_DIR/lib/serial.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
# shellcheck source=lib/migrate.sh
source "$ROOT_DIR/lib/migrate.sh"
load_module_hooks

ensure_podman

# ------------------------------------------------------------------- .env --
fresh=false
if [[ -f "$ENV_FILE" ]]; then
  log_ok "Found existing .env"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  fresh=true
fi

if [[ "$fresh" == true ]]; then
  migrate_old_apps fresh
else
  migrate_old_apps
fi

if [[ "$fresh" == true ]]; then
  port="$(get_env PORT)"
  read -r -p "Port for offline-pi (dashboard and all modules) [${port}]: " answer
  set_env PORT "${answer:-$port}"
  bind="$(get_env BIND_ADDRESS)"
  read -r -p "Bind address (0.0.0.0 = LAN/hotspot, 127.0.0.1 = this Pi only) [${bind}]: " answer
  set_env BIND_ADDRESS "${answer:-$bind}"
  log_ok "Wrote $ENV_FILE"
fi

# ---------------------------------------------------------------- modules --
# Which modules to install (build and create). Asked on every run with the
# current choice as default; which installed ones run is chosen on the
# dashboard.
echo
log_info "Modules (the dashboard is always installed):"
selected=()
for m in $(all_modules); do
  if is_installed "$m"; then hint="[Y/n]"; default=y; else hint="[y/N]"; default=n; fi
  read -r -p "  Install $(module_label "$m") ($m)? $hint " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]] && selected+=("$m")
done
set_env MODULES "$(IFS=,; echo "${selected[*]}")"
mapfile -t MODS < <(installed_modules)
log_ok "Modules: ${MODS[*]:-none}"

# ---------------------------------------------------- module configuration --
echo
core_configure
for m in ${MODS[@]+"${MODS[@]}"}; do
  run_hook "$m" configure || [[ $? -eq 127 ]] || exit 1
done

# --------------------------------------------------------------- hardware --
# Firmware mailbox vcgencmd needs for voltages and throttle flags; current
# kernels expose /dev/vcio_gencmd (group video), older ones only /dev/vcio.
vcio=""
for dev in /dev/vcio_gencmd /dev/vcio; do
  if [[ -c "$dev" ]]; then
    vcio="$dev"
    break
  fi
done
if [[ -n "$vcio" ]]; then
  set_env VCIO_DEVICE "$vcio"
  log_ok "Raspberry Pi firmware interface found ($vcio)"
  if [[ ! -r "$vcio" || ! -w "$vcio" ]]; then
    group="$(stat -c %G "$vcio")"
    log_warn "$USER cannot access $vcio, so voltage/throttle readings will be missing."
    log_warn "Fix with: sudo usermod -aG $group $USER  (then log out and back in, and re-run ./install.sh)"
  fi
else
  set_env VCIO_DEVICE /dev/null
  log_warn "No /dev/vcio* device (not a Raspberry Pi?): voltage and throttle readings will be unavailable."
fi

# ----------------------------------------------------------------- podman --
# Podman's state DB (containers card, read-only) and its API socket (core
# starts and stops the modules through it).
graph_root="$(podman info --format '{{.Store.GraphRoot}}' 2>/dev/null || true)"
set_env PODMAN_GRAPH_ROOT "$graph_root"
if [[ -n "$graph_root" && ! -f "$graph_root/db.sql" ]]; then
  log_warn "No $graph_root/db.sql (Podman older than 4.8 or the boltdb backend?): the containers card will be empty."
fi
if has_cmd systemctl && systemctl --user enable --now podman.socket >/dev/null 2>&1; then
  log_ok "podman.socket enabled (module start/stop)"
else
  log_warn "Could not enable podman.socket; modules can't be started from the dashboard until it runs (systemctl --user enable --now podman.socket)."
fi
sock="$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null || true)"
set_env PODMAN_SOCKET "${sock#unix://}"

load_env
log_ok "PORT=$PORT, BIND_ADDRESS=$BIND_ADDRESS, MODULES=${MODULES:-none}"

# ------------------------------------------------------------------ build --
prepare_builds core ${MODS[@]+"${MODS[@]}"}
log_info "Building images (the first build takes a while on a Pi)..."
compose build core ${MODS[@]+"${MODS[@]}"}
for m in ${MODS[@]+"${MODS[@]}"}; do
  run_hook "$m" post_build || [[ $? -eq 127 ]] || exit 1
done

ensure_autostart

log_ok "Install complete."
exec "$ROOT_DIR/start.sh"
