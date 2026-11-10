#!/usr/bin/env bash
# lib/modules/mesh.sh - Meshtastic messaging (apps/mesh).
#
# Node configuration needs the serial port, which only one program can open
# at a time, so those manage commands stop the module (through core, so the
# dashboard knows), run the meshtastic CLI in a one-off container from the
# same image, then start it again.

MESH_IMAGE="localhost/outpost-mesh:latest"

mesh_configure() {
  local conn old new device host
  conn="$(get_env MESH_CONNECTION)"
  if [[ -z "$conn" ]]; then
    if is_macos; then
      # the Podman machine can't reach the Mac's USB devices
      ui_note "Mesh: on macOS the node must be reachable over the network (USB can't be passed to the Podman machine)."
      conn=tcp
    else
      ui_select "Mesh: how is the Meshtastic node connected?" serial \
        "serial|USB cable|plugged into this machine" \
        "tcp|Network|Wi-Fi or Ethernet, by hostname or IP"
      conn="$UI_REPLY"
    fi
    ui_input "Mesh: PIN for sending from the web UI (empty = no PIN)" ""
    set_env MESH_SEND_PIN "$UI_REPLY"
  fi

  old="$(get_env MESH_DATA_DIR)"; old="${old:-./data/mesh}"
  new="$(prompt_dir "Mesh: where should the message history be stored?" "$old")"
  resync_dir "$old" "$new" "message history"
  set_env MESH_DATA_DIR "$new"

  if [[ "$conn" == tcp ]]; then
    host="$(get_env MESH_HOST)"
    ui_input "Mesh: hostname or IP of the Meshtastic node" "$host" mesh_host_valid
    host="$UI_REPLY"
    if [[ -z "$host" ]]; then
      log_error "MESH_CONNECTION=tcp needs a host."
      exit 1
    fi
    set_env MESH_HOST "$host"
    # compose still needs a device to map
    set_env MESH_DEVICE /dev/null
  else
    if ! device="$(choose_serial_device "$(get_env MESH_DEVICE)")"; then
      log_warn "Mesh stays unconfigured until the node is plugged in and ./install.sh is re-run."
      set_env MESH_CONNECTION ""
      set_env MESH_DEVICE /dev/null
      return 0
    fi
    set_env MESH_DEVICE "$device"
    check_serial_access "$device"
    warn_modemmanager
  fi
  set_env MESH_CONNECTION "$conn"
}

mesh_host_valid() {
  [[ -n "$1" ]] || { echo "Enter the node's hostname or IP."; return 1; }
}

mesh_usage() {
  cat <<USAGE
  mesh status                 radio state, node, channels
  mesh export [FILE]          all messages as CSV (to FILE or stdout)
  mesh info                   everything the node reports (briefly stops mesh)
  mesh set-name LONG [SHORT]  owner name shown to others (SHORT: up to 4 chars)
  mesh set-region CODE        LoRa region, e.g. EU_868 (Switzerland/EU)
  mesh fixed-position LAT LON fixed position, GPS off (the Pi doesn't move)
  mesh add-channel NAME       add a private channel with a random key
  mesh share                  channel URL and QR code for the other nodes
  mesh cli ARGS...            any meshtastic CLI command, e.g. cli --get lora
USAGE
}

# mesh_cli ARGS... - run the meshtastic CLI against the node, with the module
# stopped while the CLI holds the connection.
mesh_cli() {
  load_env
  local target=() run_opts=(--rm)
  # keep-groups (serial device access) is not supported by the remote API on macOS
  is_macos || run_opts+=(--group-add keep-groups)
  if [[ -z "${MESH_CONNECTION:-}" ]]; then
    log_error "Mesh is not configured. Run ./install.sh."
    exit 1
  fi
  if [[ "$MESH_CONNECTION" == tcp ]]; then
    target=(--host "$MESH_HOST")
  else
    if [[ ! -e "$MESH_DEVICE" ]]; then
      log_error "Meshtastic node not found at ${MESH_DEVICE}. Is it plugged in?"
      exit 1
    fi
    run_opts+=(--device "${MESH_DEVICE}:/dev/meshtastic")
    target=(--port /dev/meshtastic)
  fi
  [[ -t 1 ]] && run_opts+=(-t)
  if ! podman image exists "$MESH_IMAGE"; then
    log_error "Image $MESH_IMAGE not found. Run ./install.sh first."
    exit 1
  fi

  if [[ "$(podman inspect -f '{{.State.Running}}' outpost-mesh 2>/dev/null)" == true ]]; then
    log_info "Stopping Mesh to free the radio..."
    module_stop mesh
    # start it again however the CLI ends (error, Ctrl+C)
    trap 'log_info "Starting Mesh again..."; module_start mesh || log_warn "Could not restart Mesh; start it on the dashboard."' EXIT
  fi
  podman run "${run_opts[@]}" "$MESH_IMAGE" meshtastic "${target[@]}" "$@"
}

mesh_status() {
  podman ps -a --filter name=outpost-mesh --format '{{.Names}}  {{.Status}}'
  echo
  if ! podman exec outpost-mesh python - <<'PY'
import json, os, urllib.request
port = os.environ.get("PORT", "8084")
s = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=5))
print(f"Radio:     {s['state']}" + (f" ({s['error']})" if s.get("error") else ""))
print(f"Via:       {s['connection']} {s['device']}")
if s.get("node_id"):
    print(f"Node:      {s.get('long_name')} ({s['node_id']}, {s.get('hw_model')})")
    print(f"Firmware:  {s.get('firmware')}")
    print(f"LoRa:      {s.get('region')} {s.get('preset')}")
    print("Channels:  " + ", ".join(f"{c['index']}: {c['name']}" for c in s.get("channels", [])))
PY
  then
    log_warn "Mesh is not running. Start it on the dashboard."
  fi
}

mesh_manage() {
  case "${1:-}" in
    status) mesh_status ;;
    export)
      if [[ -n "${2:-}" ]]; then
        podman exec outpost-mesh python -m app.export > "$2"
        log_ok "Wrote $2"
      else
        podman exec outpost-mesh python -m app.export
      fi
      ;;
    info) mesh_cli --info ;;
    set-name)
      [[ -n "${2:-}" ]] || return 2
      if [[ -n "${3:-}" ]]; then
        mesh_cli --set-owner "$2" --set-owner-short "${3:0:4}"
      else
        mesh_cli --set-owner "$2"
      fi
      ;;
    set-region)
      [[ -n "${2:-}" ]] || return 2
      mesh_cli --set lora.region "$2"
      ;;
    fixed-position)
      [[ -n "${2:-}" && -n "${3:-}" ]] || return 2
      mesh_cli --setlat "$2" --setlon "$3" --set position.gps_mode DISABLED
      ;;
    add-channel)
      [[ -n "${2:-}" ]] || return 2
      # --ch-add creates a secondary channel with a random PSK
      mesh_cli --ch-add "$2"
      log_ok "Channel '$2' added. Run './manage.sh mesh share' to set up the other nodes with it."
      ;;
    share) mesh_cli --qr-all ;;
    cli)
      shift
      [[ $# -gt 0 ]] || return 2
      mesh_cli "$@"
      ;;
    *) return 2 ;;
  esac
}
