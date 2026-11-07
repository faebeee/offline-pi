#!/usr/bin/env bash
# start.sh - start (or restart) pi-monitor from an existing installation.
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

log_info "Starting pi-monitor..."
# --force-recreate: podman-compose only replaces a running container when
# the compose config changed, not when --build produced a new image.
compose --env-file "$ENV_FILE" up -d --build --force-recreate

PORT="${PORT:-8080}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "pi-monitor is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" && "${BIND_ADDRESS:-0.0.0.0}" != "127.0.0.1" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo "  Data:    ${DATA_DIR}"
echo
echo "Use 'podman compose logs -f' to follow logs, 'podman compose down' to stop."
