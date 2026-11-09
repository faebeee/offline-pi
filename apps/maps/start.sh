#!/usr/bin/env bash
# start.sh - start (or restart) the offline-maps server in the background.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

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

# The UI comes from the shared ../../ui package (Outpost design system). The
# frontend bundles a gitignored copy, refreshed here before every build.
sync_ui() {
  local sync="$SCRIPT_DIR/../../ui/sync.sh"
  if [[ ! -f "$sync" ]]; then
    log_error "Shared UI package not found at $sync. Run this from the offline-pi checkout."
    exit 1
  fi
  bash "$sync" "$SCRIPT_DIR/apps/frontend/src/outpost-ui"
}

if ! command -v podman >/dev/null 2>&1; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "No .env found. Run ./install.sh first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

sync_ui
log_info "Starting offline-maps..."
# --force-recreate: podman-compose only replaces a running container when
# the compose config changed, not when --build produced a new image.
compose --env-file "$ENV_FILE" up -d --build --force-recreate

PORT="${PORT:-8081}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "offline-maps is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo "  Data:    ${DATA_DIR:-./data}"
echo "  Assets:  ${ASSETS_DIR:-./assets}"
echo
echo "Use 'podman compose logs -f' to follow logs, 'podman compose down' to stop."
