#!/usr/bin/env bash
# manage.sh - post-install management. The ZIM set itself is defined in
# zims.txt; all downloading/serving happens inside the container.
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

CONTAINER="offline-knowledge-kiwix"

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  list     Show installed ZIMs, which are served, and what's still missing
  sync     Download entries of zims.txt that are missing (runs in the container)
  update   Download newer versions of the entries in zims.txt; the old files
           are kept until you run 'prune'
  prune    Delete outdated versions and ZIMs no longer listed in zims.txt
           (asks first)
  logs     Follow the container log (download progress)
  status   Show container status and disk usage

To change which ZIMs are installed, edit zims.txt and run ./start.sh.
USAGE
}

# in_container ARGS... - run the in-container `knowledge` tool.
in_container() {
  if ! podman container exists "$CONTAINER" 2>/dev/null \
      || [[ "$(podman inspect -f '{{.State.Running}}' "$CONTAINER")" != true ]]; then
    log_error "Container $CONTAINER is not running. Start it with ./start.sh."
    exit 1
  fi
  local -a tty=()
  [[ -t 0 && -t 1 ]] && tty=(-it)
  podman exec "${tty[@]}" "$CONTAINER" knowledge "$@"
}

cmd_prune() {
  local plan
  plan="$(in_container prune --dry-run)"
  if [[ -z "$plan" ]]; then
    log_ok "Nothing to prune."
    return
  fi
  echo "These files would be deleted (relative to $CONTENT_DIR):"
  echo "$plan" | sed 's/^/  /'
  local reply
  read -r -p "Delete them? This cannot be undone. [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy] ]]; then
    log_warn "Cancelled; nothing was deleted."
    return
  fi
  in_container prune
}

case "${1:-}" in
  list)   in_container list ;;
  sync)   in_container sync ;;
  update) in_container sync --update
          log_info "Old versions are kept but no longer served; './manage.sh prune' removes them." ;;
  prune)  cmd_prune ;;
  logs)   compose --env-file "$ENV_FILE" logs -f ;;
  status) compose --env-file "$ENV_FILE" ps
          echo
          df -h "$CONTENT_DIR" | awk 'NR==1 || NR==2' ;;
  *) usage; exit 1 ;;
esac
