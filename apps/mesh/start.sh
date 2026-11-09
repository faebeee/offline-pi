#!/usr/bin/env bash
# start.sh - start (or restart) the mesh app from an existing installation.
# Run ./install.sh first if you haven't configured this box yet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

if ! has_cmd podman; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "Run ./install.sh first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ ! -d "${DATA_DIR:-./data}" ]]; then
  log_error "Data dir '${DATA_DIR}' is not available (is the drive mounted?). Re-run ./install.sh to pick another."
  exit 1
fi

# Podman maps the device when the container is created, so it has to exist now.
if [[ "${MESH_CONNECTION:-serial}" == serial && ! -e "${MESH_DEVICE:-/dev/ttyACM0}" ]]; then
  log_error "Meshtastic node not found at ${MESH_DEVICE}. Plug it in and run ./start.sh again"
  log_error "(or re-run ./install.sh to pick another device)."
  exit 1
fi

sync_ui
log_info "Starting mesh..."
# --force-recreate: podman-compose only replaces a running container when
# the compose config changed, not when --build produced a new image.
compose --env-file "$ENV_FILE" up -d --build --force-recreate

PORT="${PORT:-8084}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo
log_ok "mesh is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" && "${BIND_ADDRESS:-0.0.0.0}" != "127.0.0.1" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo "  Radio:   ${MESH_CONNECTION:-serial} ${MESH_HOST:-${MESH_DEVICE}}"
echo "  Data:    ${DATA_DIR}"
echo
echo "Use './manage.sh status' to check the radio, './manage.sh logs' to follow logs,"
echo "'./manage.sh help' for node configuration."
