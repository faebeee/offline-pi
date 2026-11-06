#!/usr/bin/env bash
# manage.sh - post-install management: list/add/update/remove/status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/deps.sh
source "$SCRIPT_DIR/lib/deps.sh"
# shellcheck source=lib/catalog.sh
source "$SCRIPT_DIR/lib/catalog.sh"
# shellcheck source=lib/ui.sh
source "$SCRIPT_DIR/lib/ui.sh"
# shellcheck source=lib/diskcheck.sh
source "$SCRIPT_DIR/lib/diskcheck.sh"
# shellcheck source=lib/download.sh
source "$SCRIPT_DIR/lib/download.sh"

ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "No .env found. Run ./install.sh first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

CACHE_DIR="$CONTENT_DIR/.cache"
CATALOG_XML="$CACHE_DIR/catalog.xml"
CATALOG_TSV="$CACHE_DIR/catalog.tsv"
ZIM_DIR="$CONTENT_DIR/zim"

usage() {
  cat <<EOF
Usage: $0 <command>

Commands:
  list     Show installed topics with sizes
  add      Pick and download additional topics
  update   Check installed topics against the catalog for newer versions
  remove   Pick installed topics to delete
  status   Show container status and disk usage
EOF
}

refresh_catalog() {
  catalog_fetch "$CATALOG_XML"
  catalog_parse "$CATALOG_XML" "$CATALOG_TSV"
}

restart_server() {
  log_info "Restarting kiwix-serve..."
  compose --env-file "$ENV_FILE" up -d --force-recreate
  log_ok "Done."
}

cmd_list() {
  if ! compgen -G "$ZIM_DIR/*.zim" > /dev/null; then
    log_warn "No ZIM files installed yet."
    return
  fi
  printf '%-45s %10s\n' "NAME" "SIZE"
  for f in "$ZIM_DIR"/*.zim; do
    printf '%-45s %10s\n' "$(basename "$f")" "$(human_size "$(stat -c %s "$f")")"
  done
  echo
  du -sh "$CONTENT_DIR" 2>/dev/null | awk '{print "Total content size: " $1}'
}

cmd_add() {
  refresh_catalog
  read -r -p "Filter by language code (e.g. eng, fra) or leave blank for all: " lang_filter
  local selected_tsv="$CACHE_DIR/selected.tsv"
  if ! ui_select_topics "$CATALOG_TSV" "$lang_filter" > "$selected_tsv"; then
    log_warn "No topics selected."
    return
  fi

  local total_bytes=0
  while IFS=$'\t' read -r name title lang category size url updated; do
    total_bytes=$(( total_bytes + size ))
  done < "$selected_tsv"

  log_info "Total download size: $(human_size "$total_bytes")"
  if ! disk_check_sufficient "$CONTENT_DIR" "$total_bytes"; then
    log_error "Aborting: insufficient disk space."
    return 1
  fi

  if ! ui_confirm "Download $(wc -l < "$selected_tsv") topic(s) ($(human_size "$total_bytes"))?"; then
    log_warn "Cancelled."
    return
  fi

  while IFS=$'\t' read -r name title lang category size url updated; do
    download_zim "$url" "$ZIM_DIR"
  done < "$selected_tsv"

  restart_server
}

cmd_update() {
  if ! compgen -G "$ZIM_DIR/*.zim" > /dev/null; then
    log_warn "No ZIM files installed yet."
    return
  fi
  refresh_catalog

  log_info "Checking installed topics against the latest catalog..."
  local -a to_update=()
  for f in "$ZIM_DIR"/*.zim; do
    local base base_no_date
    base="$(basename "$f" .zim)"
    # Strip trailing date suffix (e.g. _2026-07 or _2026-07-22) to get a
    # flavour-stable key: "wikipedia_uk_all_nopic_2026-07" -> "wikipedia_uk_all_nopic"
    base_no_date="$(echo "$base" | sed -E 's/_[0-9]{4}-[0-9]{2}(-[0-9]{2})?$//')"

    # Find catalog rows whose download filename (also stripped of date) matches
    # this exact flavour, then pick the most recently updated one.
    local catalog_row
    catalog_row=$(awk -F'\t' -v key="$base_no_date" '
      {
        url = $6
        sub(/\.zim\.meta4$/, "", url)
        n = split(url, parts, "/")
        fname = parts[n]
        stripped = fname
        sub(/_[0-9]{4}-[0-9]{2}(-[0-9]{2})?$/, "", stripped)
        if (stripped == key) print fname "\t" $0
      }' "$CATALOG_TSV" | sort -t$'\t' -k1,1 -r | head -1 | cut -f2-)

    if [[ -z "$catalog_row" ]]; then
      continue
    fi
    local cname ctitle clang ccategory csize curl cupdated
    IFS=$'\t' read -r cname ctitle clang ccategory csize curl cupdated <<< "$catalog_row"
    local latest_base
    latest_base="$(basename "${curl%.zim.meta4}")"
    if [[ "$latest_base" != "$base" ]]; then
      log_info "Update available: $base -> $latest_base"
      to_update+=("$catalog_row")
    fi
  done

  if (( ${#to_update[@]} == 0 )); then
    log_ok "Everything is up to date."
    return
  fi

  if ! ui_confirm "Download ${#to_update[@]} update(s)?"; then
    log_warn "Cancelled."
    return
  fi

  local row
  for row in "${to_update[@]}"; do
    local cname ctitle clang ccategory csize curl cupdated
    IFS=$'\t' read -r cname ctitle clang ccategory csize curl cupdated <<< "$row"
    download_zim "$curl" "$ZIM_DIR"
  done

  log_warn "New versions downloaded alongside old ones. Review with './manage.sh list' and remove outdated files with './manage.sh remove'."
  restart_server
}

cmd_remove() {
  if ! compgen -G "$ZIM_DIR/*.zim" > /dev/null; then
    log_warn "No ZIM files installed yet."
    return
  fi

  local -a files=("$ZIM_DIR"/*.zim)
  local -a chosen
  mapfile -t chosen < <(printf '%s\n' "${files[@]##*/}" | gum filter --no-limit --placeholder "Select ZIM(s) to remove" --header "Tab to select, Enter to confirm")

  if (( ${#chosen[@]} == 0 )); then
    log_warn "Nothing selected."
    return
  fi

  if ! ui_confirm "Delete ${#chosen[@]} file(s)? This cannot be undone."; then
    log_warn "Cancelled."
    return
  fi

  local name
  for name in "${chosen[@]}"; do
    rm -fv "$ZIM_DIR/$name"
  done

  restart_server
}

cmd_status() {
  compose --env-file "$ENV_FILE" ps
  echo
  df -h "$CONTENT_DIR" | awk 'NR==1 || NR==2'
}

case "${1:-}" in
  list)   cmd_list ;;
  add)    cmd_add ;;
  update) cmd_update ;;
  remove) cmd_remove ;;
  status) cmd_status ;;
  *) usage; exit 1 ;;
esac
