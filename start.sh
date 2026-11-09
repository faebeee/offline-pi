#!/usr/bin/env bash
# start.sh - (re)start offline-pi from an existing installation: rebuild what
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

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
load_module_hooks

BUILD_FLAGS=()
for arg in "$@"; do
  case "$arg" in
    --pull) BUILD_FLAGS+=(--pull=always) ;;
    --no-cache) BUILD_FLAGS+=(--no-cache) ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) log_error "Unknown option: $arg (see ./start.sh --help)"; exit 1 ;;
  esac
done

if ! has_cmd podman; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "Run ./install.sh first."
  exit 1
fi
load_env
mapfile -t MODS < <(installed_modules)

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
log_info "Building images${BUILD_FLAGS[*]:+ (${BUILD_FLAGS[*]})}..."
# a failed build stops here: the running containers keep their old images
compose build ${BUILD_FLAGS[@]+"${BUILD_FLAGS[@]}"} core ${MODS[@]+"${MODS[@]}"}

# Modules: create (or recreate after a build) without starting; core starts
# the ones switched on. --force-recreate: podman-compose only replaces a
# container when the compose config changed, not when the image did.
# One at a time, so a module that can't be created (e.g. the Meshtastic node
# is unplugged: podman resolves devices at creation) doesn't stop the rest.
failed=()
for m in ${MODS[@]+"${MODS[@]}"}; do
  log_info "Creating $(module_label "$m")..."
  if compose up --no-start --force-recreate "$m"; then
    continue
  fi
  # compose backends without --no-start: start it; core stops it again right
  # away if it is switched off
  if compose up -d --force-recreate "$m"; then
    log_warn "$(module_label "$m"): created by starting it (compose has no --no-start)."
  else
    failed+=("$m")
    log_warn "Could not create $(module_label "$m"); it stays unavailable until ./start.sh succeeds for it."
  fi
done

# Remove containers of modules that are no longer installed.
for m in $(all_modules); do
  if ! is_installed "$m" && podman container exists "offline-pi-$m" 2>/dev/null; then
    podman rm -f "offline-pi-$m" >/dev/null && log_ok "Removed $(module_label "$m") (no longer in MODULES)"
  fi
done

log_info "Starting core..."
compose up -d --force-recreate core

PORT="${PORT:-8080}"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "offline-pi is up and running!"
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
