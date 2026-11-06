#!/usr/bin/env bash
# lib/ui.sh - gum-based interactive helpers
set -euo pipefail

# Given a TSV file (name<TAB>title<TAB>language<TAB>category<TAB>size<TAB>url<TAB>updated)
# and an optional language filter, show a multi-select checkbox list.
# Prints selected rows (full TSV lines) to stdout, one per line.
ui_select_topics() {
  local tsv_file="$1"
  local filter_lang="${2:-}"

  local -a display_lines=()
  local -a raw_lines=()

  while IFS=$'\t' read -r name title lang category size url updated; do
    [[ -z "$name" ]] && continue
    if [[ -n "$filter_lang" && "$lang" != *"$filter_lang"* ]]; then
      continue
    fi
    local human
    human=$(human_size "$size")
    display_lines+=("$(printf '%-60s %-6s %10s  [%s]' "$title" "$lang" "$human" "$name")")
    raw_lines+=("$name"$'\t'"$title"$'\t'"$lang"$'\t'"$category"$'\t'"$size"$'\t'"$url"$'\t'"$updated")
  done < "$tsv_file"

  if (( ${#display_lines[@]} == 0 )); then
    log_warn "No topics matched your filter."
    return 1
  fi

  local -a chosen
  mapfile -t chosen < <(printf '%s\n' "${display_lines[@]}" | gum filter --no-limit --placeholder "Type to filter, Tab to select, Enter to confirm" --header "Select topics to download (Tab = toggle, Enter = confirm)")

  if (( ${#chosen[@]} == 0 )); then
    return 1
  fi

  # Map chosen display lines back to raw TSV rows by index.
  local i
  for i in "${!display_lines[@]}"; do
    for c in "${chosen[@]}"; do
      if [[ "${display_lines[$i]}" == "$c" ]]; then
        echo "${raw_lines[$i]}"
      fi
    done
  done
}

ui_confirm() {
  gum confirm "$1"
}

ui_spin() {
  local title="$1"; shift
  gum spin --spinner dot --title "$title" -- "$@"
}
