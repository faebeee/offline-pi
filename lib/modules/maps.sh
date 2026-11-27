#!/usr/bin/env bash
# lib/modules/maps.sh - offline vector maps (apps/maps).

# The data folders are set by install.sh's storage step (lib/storage.sh).
maps_configure() {
  # bind-mounted as uid 1000 (keep-id); creating them first keeps them ours
  mkdir -p "$(get_env MAPS_DATA_DIR)/regions" "$(get_env MAPS_ASSETS_DIR)"
}

# one-off: pmtiles CLI, protomaps fonts/sprites, Geofabrik index
maps_post_build() {
  log_info "Maps: first-run setup (pmtiles CLI, fonts, sprites)..."
  compose run --rm --no-deps maps node backend/dist/cli/main.js setup
}
