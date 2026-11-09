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

# core_prepare - the shared UI (served to every module at /ui/) and the module
# manifests (dashboard tiles, nav, gateway routes) go into the build context.
core_prepare() {
  local dest="$ROOT_DIR/services/core/modules" f
  sync_ui "$ROOT_DIR/services/core/public/ui"
  mkdir -p "$dest"
  rm -f "$dest"/*.json
  for f in "$ROOT_DIR"/services/*/module.json; do
    cp "$f" "$dest/$(basename "$(dirname "$f")").json"
  done
}
