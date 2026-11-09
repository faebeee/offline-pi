#!/usr/bin/env bash
# start.sh - start (or restart) mesh-map from an existing installation.
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

# Podman fails to create the container when a bind-mount source is missing.
for dir in "${MAPS_DATA_DIR:-../maps/data}" "${MAPS_ASSETS_DIR:-../maps/assets}"; do
  if [[ ! -d "$dir" ]]; then
    log_error "apps/maps directory '$dir' is not available (drive not mounted?). Re-run ./install.sh to pick another."
    exit 1
  fi
done

sync_ui
log_info "Starting mesh-map..."
# --force-recreate: podman-compose only replaces a running container when
# the compose config changed, not when --build produced a new image.
compose --env-file "$ENV_FILE" up -d --build --force-recreate

PORT="${PORT:-8086}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
echo
log_ok "mesh-map is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" && "${BIND_ADDRESS:-0.0.0.0}" != "127.0.0.1" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo "  Mesh:    port ${MESH_PORT:-8084} (apps/mesh needs MESH_MAP_PORT=${PORT}, its default is 8086)"
echo "  Maps:    ${MAPS_DATA_DIR} (read-only)"
echo
echo "Logs: 'podman compose logs -f'. Stop: 'podman compose down'."
