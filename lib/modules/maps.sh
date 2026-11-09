#!/usr/bin/env bash
# lib/modules/maps.sh - offline vector maps (services/maps).

maps_configure() {
  local old_data old_assets new_data new_assets
  old_data="$(get_env MAPS_DATA_DIR)"; old_data="${old_data:-./data/maps}"
  old_assets="$(get_env MAPS_ASSETS_DIR)"; old_assets="${old_assets:-./data/maps-assets}"
  new_data="$(prompt_dir "Maps: where should region archives and POIs be stored?" "$old_data")"
  new_assets="$(prompt_dir "Maps: where should fonts and sprites be stored?" "$old_assets")"
  resync_dir "$old_data" "$new_data" "map data"
  resync_dir "$old_assets" "$new_assets" "map assets"
  set_env MAPS_DATA_DIR "$new_data"
  set_env MAPS_ASSETS_DIR "$new_assets"
  # bind-mounted as uid 1000 (keep-id); creating them first keeps them ours
  mkdir -p "$new_data/regions" "$new_assets"
}

maps_prepare() {
  sync_ui "$ROOT_DIR/services/maps/apps/frontend/src/outpost-ui"
}

# one-off: pmtiles CLI, protomaps fonts/sprites, Geofabrik index
maps_post_build() {
  log_info "Maps: first-run setup (pmtiles CLI, fonts, sprites)..."
  compose run --rm --no-deps maps node apps/backend/dist/cli/main.js setup
}
