#!/usr/bin/env bash
# install.sh - first-time setup for the mesh app: check dependencies, write
# .env, pick the Meshtastic node, build the image, then start it. Safe to re-run.
#
# DATA_DIR and the serial device are re-prompted on every run (defaulting to
# the current values), so re-running this script is also how you move the
# history to an SSD or switch to another node.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/storage.sh
source "$SCRIPT_DIR/lib/storage.sh"
# shellcheck source=lib/serial.sh
source "$SCRIPT_DIR/lib/serial.sh"

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

  read -r -p "Port for the web UI [${PORT}]: " answer
  set_env PORT "${answer:-$PORT}"
  read -r -p "Bind address (0.0.0.0 = LAN/hotspot, 127.0.0.1 = this Pi only) [${BIND_ADDRESS}]: " answer
  set_env BIND_ADDRESS "${answer:-$BIND_ADDRESS}"
  read -r -p "How is the node connected? (serial = USB, tcp = over the network) [${MESH_CONNECTION}]: " answer
  answer="${answer:-$MESH_CONNECTION}"
  if [[ "$answer" != serial && "$answer" != tcp ]]; then
    log_error "Answer 'serial' or 'tcp'."
    rm -f "$ENV_FILE"
    exit 1
  fi
  set_env MESH_CONNECTION "$answer"
  read -r -p "PIN for sending from the web UI (empty = no PIN) []: " answer
  set_env SEND_PIN "$answer"
  log_ok "Wrote $ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ---------------------------------------------------------------- storage --
old_data_dir="${DATA_DIR:-./data}"
new_data_dir="$(prompt_dir "Where should the message history be stored?" "$old_data_dir")"
resync_dir "$old_data_dir" "$new_data_dir" "message history"
set_env DATA_DIR "$new_data_dir"

# ------------------------------------------------------------------ radio --
if [[ "${MESH_CONNECTION:-serial}" == tcp ]]; then
  read -r -p "Hostname or IP of the Meshtastic node [${MESH_HOST}]: " answer
  answer="${answer:-$MESH_HOST}"
  if [[ -z "$answer" ]]; then
    log_error "MESH_CONNECTION=tcp needs a host."
    exit 1
  fi
  set_env MESH_HOST "$answer"
  # compose still needs a device to map
  set_env MESH_DEVICE /dev/null
else
  device="$(choose_serial_device "${MESH_DEVICE:-}")"
  set_env MESH_DEVICE "$device"
  check_serial_access "$device"
  warn_modemmanager
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
log_ok "DATA_DIR=$DATA_DIR, PORT=$PORT, MESH_CONNECTION=$MESH_CONNECTION, MESH_DEVICE=$MESH_DEVICE"

sync_ui
log_info "Building the mesh image (first build takes a few minutes on a Pi)..."
compose --env-file "$ENV_FILE" build

ensure_autostart

log_ok "Install complete."
exec "$SCRIPT_DIR/start.sh"
