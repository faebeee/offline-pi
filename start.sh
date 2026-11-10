#!/usr/bin/env bash
# start.sh - (re)start outpost from an existing installation: rebuild what
# changed, recreate the containers, then core starts the modules that are
# switched on in the dashboard. Run ./install.sh first.
#
#   ./start.sh [--pull] [--no-cache]
#     --pull      also pull newer base images (node, python, kiwix) first
#     --no-cache  rebuild every image from scratch, ignoring the layer cache
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"
# full output of the build and compose steps (install.sh passes its own)
if [[ -z "${UI_LOG:-}" ]]; then
  export UI_LOG="$ROOT_DIR/start.log"
  : >"$UI_LOG"
fi

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
# shellcheck source=lib/migrate.sh
source "$ROOT_DIR/lib/migrate.sh"
load_module_hooks

BUILD_FLAGS=()
for arg in "$@"; do
  case "$arg" in
    --pull) BUILD_FLAGS+=(--pull) ;;
    --no-cache) BUILD_FLAGS+=(--no-cache) ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) log_error "Unknown option: $arg (see ./start.sh --help)"; exit 1 ;;
  esac
done

if ! has_cmd podman; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi
if is_macos; then
  case "$(macos_machine_state)" in
    running) ;;
    stopped) ui_run "Starting the Podman machine" podman machine start || exit 1 ;;
    none) log_error "No Podman machine. Run ./install.sh first."; exit 1 ;;
  esac
fi
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "Run ./install.sh first."
  exit 1
fi
load_env
read_lines MODS installed_modules

# Every bind-mounted directory must be there (an unplugged SSD would
# otherwise make podman fail with a less helpful error).
for m in core ${MODS[@]+"${MODS[@]}"}; do
  for var in $(module_dirs "$m"); do
    dir="${!var:-}"
    if [[ -z "$dir" || ! -d "$dir" ]]; then
      log_error "$var '${dir}' is not available (is the drive mounted?). Re-run ./install.sh to pick another."
      exit 1
    fi
  done
done

prepare_builds core ${MODS[@]+"${MODS[@]}"}
# a failed build stops here: the running containers keep their old images.
# The flags go after the services: podman-compose's --pull takes an optional
# value and would read the first service name as it.
if ! ui_run "Building images${BUILD_FLAGS[*]:+ (${BUILD_FLAGS[*]})}" \
  compose build core ${MODS[@]+"${MODS[@]}"} ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"}; then
  log_error "Build failed; the running containers keep their old images."
  exit 1
fi

# Modules: create (or recreate after a build) without starting; core starts
# the ones switched on. --force-recreate: podman-compose only replaces a
# container when the compose config changed, not when the image did.
# One at a time, so a module that can't be created (e.g. the Meshtastic node
# is unplugged: podman resolves devices at creation) doesn't stop the rest.
# the project used to be called offline-pi: its containers go first
migrate_project_rename

failed=()
# create_module SERVICE - create its container; compose backends without
# --no-start start it instead (core stops it again right away if it is
# switched off).
create_module() {
  compose up --no-start --force-recreate "$1" || compose up -d --force-recreate "$1"
}
for m in ${MODS[@]+"${MODS[@]}"}; do
  if ! ui_run "Creating $(module_label "$m")" create_module "$m"; then
    failed+=("$m")
    log_warn "Could not create $(module_label "$m"); it stays unavailable until ./start.sh succeeds for it."
  fi
done

# Remove containers of modules that are no longer installed.
for m in $(all_modules); do
  if ! is_installed "$m" && podman container exists "outpost-$m" 2>/dev/null; then
    podman rm -f "outpost-$m" >/dev/null && log_ok "Removed $(module_label "$m") (no longer in MODULES)"
  fi
done
remove_retired_modules

ui_run "Starting core" compose up -d --force-recreate core

PORT="${PORT:-8080}"
# macOS: the containers' host network is the Podman machine's; forward the
# port from the Mac (not persistent, so on every start)
if is_macos && ! macos_expose_port "$PORT" "${BIND_ADDRESS:-0.0.0.0}"; then
  log_warn "Could not forward port $PORT from the Mac into the Podman machine."
fi

# wait_for_core - until core answers (it starts the modules meanwhile).
wait_for_core() {
  local i
  for i in $(seq 1 90); do
    curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/api/system/status" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
if has_cmd curl && ! ui_run "Waiting for the web app" wait_for_core; then
  log_warn "Core does not answer yet; see './manage.sh logs'."
fi

LAN_IP="$(lan_ip)"
echo
log_ok "outpost is up and running!"
echo "  Local:   http://localhost:${PORT}"
if [[ -n "$LAN_IP" && "${BIND_ADDRESS:-0.0.0.0}" != "127.0.0.1" ]]; then
  echo "  LAN:     http://${LAN_IP}:${PORT}"
fi
echo "  Modules: ${MODS[*]:-none} (start and stop them on the dashboard)"
if [[ ${#failed[@]} -gt 0 ]]; then
  log_warn "Not available: ${failed[*]} (see the errors above; for mesh, is the node plugged in?)"
fi
echo
echo "Use './manage.sh status' for the state of every module, './manage.sh logs [module]' to follow logs."
