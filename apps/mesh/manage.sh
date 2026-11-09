#!/usr/bin/env bash
# manage.sh - day-to-day commands for the mesh app: status, logs, export, and
# Meshtastic node configuration through the official `meshtastic` CLI.
#
# Node configuration needs the serial port, which only one program can open
# at a time, so those commands stop the app, run the CLI in a one-off
# container from the same image, then start the app again.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

ENV_FILE="$SCRIPT_DIR/.env"
IMAGE="localhost/offline-pi-mesh:latest"

usage() {
  cat <<USAGE
Usage: ./manage.sh <command> [args]

App:
  status                      app and radio state, node, channels
  logs                        follow the app's logs (Ctrl+C to stop)
  export [FILE]               all messages as CSV (to FILE or stdout)

Node configuration (briefly stops the app):
  info                        everything the node reports (config, channels, nodes)
  set-name LONG [SHORT]       owner name shown to others (SHORT: up to 4 chars)
  set-region CODE             LoRa region, e.g. EU_868 (Switzerland/EU)
  fixed-position LAT LON      set a fixed position and turn GPS off (the Pi doesn't move)
  add-channel NAME            add a private channel with a random key
  share                       print the channel URL and QR code to set up other nodes
  cli ARGS...                 run any meshtastic CLI command, e.g. cli --get lora
USAGE
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Run ./install.sh first."
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}

# meshtastic ARGS... - run the meshtastic CLI against the node, with the app
# stopped while it holds the connection.
meshtastic() {
  require_env
  local target=() run_opts=(--rm --group-add keep-groups)
  if [[ "${MESH_CONNECTION:-serial}" == tcp ]]; then
    target=(--host "$MESH_HOST")
  else
    if [[ ! -e "${MESH_DEVICE}" ]]; then
      log_error "Meshtastic node not found at ${MESH_DEVICE}. Is it plugged in?"
      exit 1
    fi
    run_opts+=(--device "${MESH_DEVICE}:/dev/meshtastic")
    target=(--port /dev/meshtastic)
  fi
  [[ -t 1 ]] && run_opts+=(-t)
  if ! podman image exists "$IMAGE"; then
    log_error "Image $IMAGE not found. Run ./install.sh first."
    exit 1
  fi

  log_info "Stopping the app to free the radio..."
  compose --env-file "$ENV_FILE" stop >/dev/null 2>&1 || true
  # Start the app again however the CLI ends (error, Ctrl+C).
  trap 'log_info "Starting the app again..."; compose --env-file "$ENV_FILE" start >/dev/null 2>&1 || log_warn "Could not restart the app; run ./start.sh"' EXIT
  podman run "${run_opts[@]}" "$IMAGE" meshtastic "${target[@]}" "$@"
}

cmd_status() {
  require_env
  compose --env-file "$ENV_FILE" ps
  echo
  if ! compose --env-file "$ENV_FILE" exec -T mesh python - <<'PY'
import json, urllib.request
s = json.load(urllib.request.urlopen("http://127.0.0.1:8084/api/status", timeout=5))
print(f"Radio:     {s['state']}" + (f" ({s['error']})" if s.get("error") else ""))
print(f"Via:       {s['connection']} {s['device']}")
if s.get("node_id"):
    print(f"Node:      {s.get('long_name')} ({s['node_id']}, {s.get('hw_model')})")
    print(f"Firmware:  {s.get('firmware')}")
    print(f"LoRa:      {s.get('region')} {s.get('preset')}")
    print("Channels:  " + ", ".join(f"{c['index']}: {c['name']}" for c in s.get("channels", [])))
PY
  then
    log_warn "The app is not running. Start it with ./start.sh"
  fi
}

case "${1:-}" in
  status) cmd_status ;;
  logs)
    require_env
    compose --env-file "$ENV_FILE" logs -f
    ;;
  export)
    require_env
    if [[ -n "${2:-}" ]]; then
      compose --env-file "$ENV_FILE" exec -T mesh python -m app.export > "$2"
      log_ok "Wrote $2"
    else
      compose --env-file "$ENV_FILE" exec -T mesh python -m app.export
    fi
    ;;
  info) meshtastic --info ;;
  set-name)
    [[ -n "${2:-}" ]] || { usage; exit 1; }
    if [[ -n "${3:-}" ]]; then
      meshtastic --set-owner "$2" --set-owner-short "${3:0:4}"
    else
      meshtastic --set-owner "$2"
    fi
    ;;
  set-region)
    [[ -n "${2:-}" ]] || { usage; exit 1; }
    meshtastic --set lora.region "$2"
    ;;
  fixed-position)
    [[ -n "${2:-}" && -n "${3:-}" ]] || { usage; exit 1; }
    meshtastic --setlat "$2" --setlon "$3" --set position.gps_mode DISABLED
    ;;
  add-channel)
    [[ -n "${2:-}" ]] || { usage; exit 1; }
    # --ch-add creates a secondary channel with a random PSK
    meshtastic --ch-add "$2"
    log_ok "Channel '$2' added. Run './manage.sh share' to set up the other nodes with it."
    ;;
  share) meshtastic --qr-all ;;
  cli)
    shift
    [[ $# -gt 0 ]] || { usage; exit 1; }
    meshtastic "$@"
    ;;
  help|-h|--help) usage ;;
  *) usage; exit 1 ;;
esac
