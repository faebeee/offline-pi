#!/usr/bin/env bash
# start.sh - start (or restart) kiwix-serve from an existing installation.
# Run ./install.sh first if you haven't configured this box yet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/deps.sh
source "$SCRIPT_DIR/lib/deps.sh"

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "No .env found. Run ./install.sh first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

log_info "Starting kiwix-serve..."
compose --env-file "$ENV_FILE" up -d

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "Kiwix is up and running!"
echo "  Local:   http://localhost:${KIWIX_PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:     http://${LAN_IP}:${KIWIX_PORT}"
fi
echo
echo "Use ./manage.sh to add more topics, check status, update, or remove content."
