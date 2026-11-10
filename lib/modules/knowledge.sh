#!/usr/bin/env bash
# lib/modules/knowledge.sh - Kiwix library (apps/knowledge). Which books to
# download is chosen on the Library screen of the web app (stored in
# selection.txt in the content dir); downloads run in the container.

KNOWLEDGE_CONTAINER="offline-pi-knowledge"

knowledge_configure() {
  local old new
  old="$(get_env KNOWLEDGE_CONTENT_DIR)"; old="${old:-./data/knowledge}"
  new="$(prompt_dir "Library: where should the books be stored (you choose them later in the web app; up to hundreds of GB)?" "$old")"
  resync_dir "$old" "$new" "library content"
  set_env KNOWLEDGE_CONTENT_DIR "$new"
  mkdir -p "$new/zim"
}

knowledge_usage() {
  cat <<USAGE
  knowledge list              installed ZIMs, which are served, what's missing
  knowledge sync              download missing selected books (choose them on the Library screen)
  knowledge update            download newer versions (old ones kept until prune)
  knowledge prune             delete outdated / unselected ZIMs (asks first)
USAGE
}

# knowledge_exec ARGS... - run the in-container `knowledge` tool.
knowledge_exec() {
  if [[ "$(podman inspect -f '{{.State.Running}}' "$KNOWLEDGE_CONTAINER" 2>/dev/null)" != true ]]; then
    log_error "The Library module is not running. Start it on the dashboard."
    exit 1
  fi
  local -a tty=()
  [[ -t 0 && -t 1 ]] && tty=(-it)
  podman exec "${tty[@]}" "$KNOWLEDGE_CONTAINER" knowledge "$@"
}

knowledge_manage() {
  case "${1:-}" in
    list) knowledge_exec list ;;
    sync) knowledge_exec sync ;;
    update)
      knowledge_exec sync --update
      log_info "Old versions are kept but no longer served; './manage.sh knowledge prune' removes them."
      ;;
    prune)
      local plan reply
      plan="$(knowledge_exec prune --dry-run)"
      if [[ -z "$plan" ]]; then
        log_ok "Nothing to prune."
        return
      fi
      echo "These files would be deleted (relative to $(get_env KNOWLEDGE_CONTENT_DIR)):"
      echo "$plan" | sed 's/^/  /'
      read -r -p "Delete them? This cannot be undone. [y/N] " reply
      if [[ ! "$reply" =~ ^[Yy] ]]; then
        log_warn "Cancelled; nothing was deleted."
        return
      fi
      knowledge_exec prune
      ;;
    *) return 2 ;;
  esac
}
