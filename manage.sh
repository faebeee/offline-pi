#!/usr/bin/env bash
# manage.sh - day-to-day commands: module state, start/stop, logs, and each
# module's own commands (lib/modules/<module>.sh, <name>_manage).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
load_module_hooks

usage() {
  cat <<USAGE
Usage: ./manage.sh <command> [args]

  status                      every module: installed, running, health
  start MODULE / stop MODULE  same as the dashboard's START / STOP
  logs [MODULE]               follow the logs (default: core)

Module commands:
USAGE
  local m
  for m in $(all_modules); do
    run_hook "$m" usage || true
  done
  echo
  echo "Modules: $(all_modules | tr '\n' ' ')"
  echo "Add or remove modules by re-running ./install.sh."
}

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Run ./install.sh first."
    exit 1
  fi
}

require_module() {
  if [[ -z "${1:-}" ]] || ! is_module "$1"; then
    log_error "Unknown module '${1:-}'. Modules: $(all_modules | tr '\n' ' ')"
    exit 1
  fi
  if ! is_installed "$1"; then
    log_error "$(module_label "$1") is not installed. Add it with ./install.sh."
    exit 1
  fi
}

cmd_status() {
  local m state
  printf '%-12s %-10s %s\n' MODULE INSTALLED STATE
  for m in core $(all_modules); do
    if [[ "$m" == core ]] || is_installed "$m"; then
      state="$(podman ps -a --filter "name=^outpost-$m\$" --format '{{.Status}}' 2>/dev/null | head -n 1)"
      printf '%-12s %-10s %s\n' "$m" yes "${state:-no container (run ./start.sh)}"
    else
      printf '%-12s %-10s %s\n' "$m" no -
    fi
  done
}

case "${1:-}" in
  status) require_env; cmd_status ;;
  start|stop)
    require_env
    require_module "${2:-}"
    if out="$(core_api POST "/api/modules/$2/$1" 2>&1)"; then
      log_ok "$(module_label "$2"): ${1/stop/stopp}ed"
    else
      log_error "Core did not $1 $2: ${out:-is core running? (./start.sh)}"
      exit 1
    fi
    ;;
  logs)
    require_env
    if [[ -n "${2:-}" && "$2" != core ]]; then require_module "$2"; fi
    podman logs -f "outpost-${2:-core}"
    ;;
  help|-h|--help) usage ;;
  *)
    m="${1:-}"
    if [[ -n "$m" ]] && is_module "$m"; then
      require_env
      require_module "$m"
      shift
      rc=0
      run_hook "$m" manage "$@" || rc=$?
      if [[ $rc -eq 2 || $rc -eq 127 ]]; then
        usage
        exit 1
      fi
      exit "$rc"
    fi
    usage
    exit 1
    ;;
esac
