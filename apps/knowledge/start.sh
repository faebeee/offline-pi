#!/usr/bin/env bash
# start.sh - (re)build and (re)start the knowledge container from an existing
# installation. Picks up edits to zims.txt: the container downloads any
# missing entries in the background while already installed ones are served.
# Run ./install.sh first if you haven't configured this box yet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/deps.sh
source "$SCRIPT_DIR/lib/deps.sh"

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "Run ./install.sh first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ ! -d "$CONTENT_DIR" ]] || ! ls "$CONTENT_DIR" >/dev/null 2>&1; then
  log_error "Content dir '$CONTENT_DIR' is not available (is the SSD mounted?)."
  exit 1
fi

log_info "Starting kiwix-serve..."
# --force-recreate: podman-compose only replaces a running container when the
# compose config changed, so a rebuilt image (new zims.txt) would be ignored.
compose --env-file "$ENV_FILE" up -d --build --force-recreate

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "Kiwix is up and running!"
echo "  Local:   http://localhost:${KIWIX_PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:     http://${LAN_IP}:${KIWIX_PORT}"
fi
echo
if [[ "${AUTO_SYNC:-true}" == true ]]; then
  echo "Missing ZIMs from zims.txt are now downloading inside the container and"
  echo "appear in the library as each one completes. Follow progress with:"
  echo "  ./manage.sh logs"
else
  echo "AUTO_SYNC=false: run ./manage.sh sync to download missing ZIMs."
fi
echo "See ./manage.sh for list/status/update/prune."
