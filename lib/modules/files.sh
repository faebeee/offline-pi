#!/usr/bin/env bash
# lib/modules/files.sh - a shared folder for everyone on the Pi's network (apps/files).

files_configure() {
  local old new
  old="$(get_env FILES_DATA_DIR)"; old="${old:-./data/files}"
  new="$(prompt_dir "Files: where should the shared files be stored?" "$old")"
  resync_dir "$old" "$new" "the shared files"
  set_env FILES_DATA_DIR "$new"
}
