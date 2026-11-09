#!/usr/bin/env bash
# lib/modules/mesh-map.sh - live map of the mesh nodes (services/mesh-map).
# Reads the maps module's MAPS_DATA_DIR / MAPS_ASSETS_DIR read-only.

mesh_map_configure() {
  local data assets
  data="$(get_env MAPS_DATA_DIR)"; data="${data:-./data/maps}"
  assets="$(get_env MAPS_ASSETS_DIR)"; assets="${assets:-./data/maps-assets}"
  if ! is_installed maps; then
    log_info "Mesh map draws on the regions of the Maps module, which is not installed."
    data="$(prompt_dir "Mesh map: maps data directory (regions)" "$data")"
    assets="$(prompt_dir "Mesh map: maps assets directory (fonts, sprites)" "$assets")"
    set_env MAPS_DATA_DIR "$data"
    set_env MAPS_ASSETS_DIR "$assets"
  fi
  # the read-only mounts need the directories to exist
  mkdir -p "$data" "$assets"
  if [[ ! -f "$data/regions.json" ]]; then
    log_warn "Mesh map: no map regions downloaded yet; nodes show on a blank map until you add one in Maps."
  fi
  if ! is_installed mesh; then
    log_warn "Mesh map shows the nodes heard by the Mesh module, which is not installed."
  fi
}

mesh_map_prepare() {
  sync_ui "$ROOT_DIR/services/mesh-map/src/outpost-ui"
}
