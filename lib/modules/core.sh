#!/usr/bin/env bash
# lib/modules/core.sh - the dashboard, gateway and module supervisor.

core_configure() {
  local old new
  old="$(get_env CORE_DATA_DIR)"
  old="${old:-./data/core}"
  new="$(prompt_dir "Where should the dashboard keep its history and settings?" "$old")"
  resync_dir "$old" "$new" "dashboard data"
  set_env CORE_DATA_DIR "$new"
}
