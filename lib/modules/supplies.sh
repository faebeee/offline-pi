#!/usr/bin/env bash
# lib/modules/supplies.sh - emergency supplies, expiry dates, days of water (apps/supplies).

supplies_configure() {
  local old new
  old="$(get_env SUPPLIES_DATA_DIR)"; old="${old:-./data/supplies}"
  new="$(prompt_dir "Supplies: where should the supplies list be stored?" "$old")"
  resync_dir "$old" "$new" "the supplies list"
  set_env SUPPLIES_DATA_DIR "$new"
}
