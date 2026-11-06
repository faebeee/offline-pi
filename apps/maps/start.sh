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

if ! command -v podman >/dev/null 2>&1; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi

log_info "Starting offline-maps..."
compose up -d --build

PORT="${PORT:-8080}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "offline-maps is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo
echo "Use 'podman compose logs -f' to follow logs, 'podman compose down' to stop."
