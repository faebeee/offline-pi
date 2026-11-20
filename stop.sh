#!/usr/bin/env bash
# stop.sh - stop outpost: core first, then every module container. Nothing
# is removed and the dashboard's module switches are kept, so ./start.sh
# brings back the same state (outpost doesn't start on its own at boot).
#
#   ./stop.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"

for arg in "$@"; do
  case "$arg" in
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) log_error "Unknown option: $arg (see ./stop.sh --help)"; exit 1 ;;
  esac
done

if ! has_cmd podman; then
  log_error "podman is required. Run ./install.sh first."
  exit 1
fi
if is_macos && [[ "$(macos_machine_state)" != running ]]; then
  log_ok "The Podman machine is not running: outpost is already stopped."
  exit 0
fi

# outpost_running - names of the running outpost containers, core first:
# stopped before the modules, it can't start one again meanwhile.
outpost_running() {
  podman ps --filter name='^outpost-' --format '{{.Names}}' 2>/dev/null \
    | awk '$0 == "outpost-core" { print; next } { rest = rest $0 "\n" } END { printf "%s", rest }'
}
read_lines RUNNING outpost_running

if [[ ${#RUNNING[@]} -eq 0 ]]; then
  log_ok "outpost is already stopped."
  exit 0
fi

failed=0
for c in "${RUNNING[@]}"; do
  if podman stop "$c" >/dev/null; then
    log_ok "Stopped $c"
  else
    log_warn "Could not stop $c"
    failed=1
  fi
done

if [[ $failed -ne 0 ]]; then
  log_error "Some containers are still running; see './manage.sh status'."
  exit 1
fi
log_ok "outpost is stopped. Run ./start.sh to start it again."
