#!/usr/bin/env bash
# install.sh - first-time setup for pi-monitor: check dependencies, write
# .env, build the image, then start it. Safe to re-run.
#
# DATA_DIR is re-prompted on every run (defaulting to the current value), so
# re-running this script is also how you relocate the history to an SSD.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/storage.sh
source "$SCRIPT_DIR/lib/storage.sh"

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

ensure_podman

if [[ -f "$ENV_FILE" ]]; then
  log_ok "Found existing .env"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"

  read -r -p "Port for the dashboard [${PORT}]: " answer
  set_env PORT "${answer:-$PORT}"
  read -r -p "Bind address (0.0.0.0 = LAN, 127.0.0.1 = this Pi only) [${BIND_ADDRESS}]: " answer
  set_env BIND_ADDRESS "${answer:-$BIND_ADDRESS}"
  log_ok "Wrote $ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ---------------------------------------------------------------- storage --
old_data_dir="${DATA_DIR:-./data}"
new_data_dir="$(prompt_dir "Where should the metric history be stored?" "$old_data_dir")"
resync_dir "$old_data_dir" "$new_data_dir" "metric history"
set_env DATA_DIR "$new_data_dir"

# --------------------------------------------------------------- hardware --
# The firmware mailbox vcgencmd needs for voltages and throttle flags.
# Current kernels expose a restricted /dev/vcio_gencmd (group video) next to
# a root-only /dev/vcio; older ones only /dev/vcio. Re-detected on every run;
# /dev/null keeps compose happy on non-Pi hosts.
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

# Podman's storage root: the dashboard reads its state DB (read-only) to
# list containers. Re-detected on every run.
graph_root="$(podman info --format '{{.Store.GraphRoot}}' 2>/dev/null || true)"
set_env PODMAN_GRAPH_ROOT "$graph_root"
if [[ -n "$graph_root" && ! -f "$graph_root/db.sql" ]]; then
  log_warn "No $graph_root/db.sql (Podman older than 4.8 or the boltdb backend?): the containers card will be empty."
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
log_ok "DATA_DIR=$DATA_DIR, PORT=$PORT, VCIO_DEVICE=$VCIO_DEVICE"

sync_ui
log_info "Building the pi-monitor image (first build takes a few minutes on a Pi)..."
compose --env-file "$ENV_FILE" build

ensure_autostart

log_ok "Install complete."
exec "$SCRIPT_DIR/start.sh"
