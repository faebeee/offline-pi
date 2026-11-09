#!/usr/bin/env bash
# install.sh - first-time setup for mesh-map: check dependencies, write .env,
# find apps/maps' map data, build the image, then start it. Safe to re-run.
#
# mesh-map stores nothing of its own. It mounts apps/maps' DATA_DIR and
# ASSETS_DIR read-only; those two paths are re-prompted on every run
# (defaulting to the current values), so re-running this script follows
# apps/maps when its data moves (e.g. to an SSD).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/maps.sh
source "$SCRIPT_DIR/lib/maps.sh"

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

ensure_podman

first_run=false
if [[ -f "$ENV_FILE" ]]; then
  log_ok "Found existing .env"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  first_run=true
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"

  read -r -p "Port for the web UI [${PORT}]: " answer
  set_env PORT "${answer:-$PORT}"
  read -r -p "Bind address (0.0.0.0 = LAN/hotspot, 127.0.0.1 = this Pi only) [${BIND_ADDRESS}]: " answer
  set_env BIND_ADDRESS "${answer:-$BIND_ADDRESS}"
  read -r -p "Port of the Mesh app (apps/mesh), off = no nodes [${MESH_PORT}]: " answer
  set_env MESH_PORT "${answer:-$MESH_PORT}"
  log_ok "Wrote $ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ------------------------------------------------------ apps/maps' data --
# First run: take the paths from apps/maps/.env. Later: keep ours, but say so
# when apps/maps now points somewhere else (it was relocated).
maps_data="$(maps_env_dir DATA_DIR ./data)"
maps_assets="$(maps_env_dir ASSETS_DIR ./assets)"
if [[ "$first_run" == true ]]; then
  current_data="$maps_data"
  current_assets="$maps_assets"
else
  current_data="${MAPS_DATA_DIR:-$maps_data}"
  current_assets="${MAPS_ASSETS_DIR:-$maps_assets}"
  [[ "$current_data" != "$maps_data" ]] && log_warn "apps/maps/.env has DATA_DIR=$maps_data (this app uses $current_data)."
  [[ "$current_assets" != "$maps_assets" ]] && log_warn "apps/maps/.env has ASSETS_DIR=$maps_assets (this app uses $current_assets)."
fi

log_info "mesh-map shows the regions downloaded by apps/maps, read-only."
new_data="$(prompt_maps_dir "apps/maps data directory (its DATA_DIR)" "$current_data")"
new_assets="$(prompt_maps_dir "apps/maps assets directory (its ASSETS_DIR)" "$current_assets")"
set_env MAPS_DATA_DIR "$new_data"
set_env MAPS_ASSETS_DIR "$new_assets"

if [[ ! -f "$new_data/regions.json" ]]; then
  log_warn "No regions downloaded in apps/maps yet; nodes will show on a blank map until you add one there."
fi
if [[ ! -f "$new_assets/fonts/Noto Sans Regular/0-255.pbf" ]]; then
  log_warn "apps/maps hasn't vendored its fonts/sprites yet (run its ./install.sh); labels won't render until then."
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
log_ok "PORT=$PORT, MESH_PORT=$MESH_PORT, MAPS_DATA_DIR=$MAPS_DATA_DIR, MAPS_ASSETS_DIR=$MAPS_ASSETS_DIR"

sync_ui
log_info "Building the mesh-map image..."
compose --env-file "$ENV_FILE" build

ensure_autostart

log_ok "Install complete."
exec "$SCRIPT_DIR/start.sh"
