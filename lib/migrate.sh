#!/usr/bin/env bash
# lib/migrate.sh - adopt an installation of the old per-app layout
# (apps/<name>/ with its own .env and compose project) into the single app.
#
# `git pull` removes the tracked files of apps/*, but each app's untracked
# .env, data/ and build leftovers stay on disk. For every apps/<name>/.env:
#   1. copy its settings into the root .env under the new names (relative
#      paths resolved against apps/<name>/), so the *_DIR prompts default to
#      where the data already is and nothing has to be downloaded again;
#   2. mark the module installed;
#   3. stop and remove the old containers and images;
#   4. rename the old .env to .env.migrated (data is never touched here; the
#      storage prompts offer to move it).

# old app dir -> module (empty: core)
declare -A MIGRATE_MODULE=([monitor]="" [maps]=maps [knowledge]=knowledge [mesh]=mesh [mesh-map]=mesh-map)
# old app dir -> "OLD_VAR:NEW_VAR ..." (":dir" suffix = a path to resolve)
declare -A MIGRATE_VARS=(
  [monitor]="DATA_DIR:CORE_DATA_DIR:dir PORT:PORT BIND_ADDRESS:BIND_ADDRESS SAMPLE_INTERVAL_MS:SAMPLE_INTERVAL_MS"
  [maps]="DATA_DIR:MAPS_DATA_DIR:dir ASSETS_DIR:MAPS_ASSETS_DIR:dir ALLOWED_ORIGINS:MAPS_ALLOWED_ORIGINS DATABASE_URL:MAPS_DATABASE_URL DB_LOGGING:MAPS_DB_LOGGING"
  [knowledge]="CONTENT_DIR:KNOWLEDGE_CONTENT_DIR:dir AUTO_SYNC:KNOWLEDGE_AUTO_SYNC"
  [mesh]="DATA_DIR:MESH_DATA_DIR:dir MESH_CONNECTION:MESH_CONNECTION MESH_DEVICE:MESH_DEVICE MESH_HOST:MESH_HOST SEND_PIN:MESH_SEND_PIN SEND_RATE_LIMIT:MESH_SEND_RATE_LIMIT"
  [mesh-map]="MAPS_DATA_DIR:MAPS_DATA_DIR:dir MAPS_ASSETS_DIR:MAPS_ASSETS_DIR:dir"
)
# old app dir -> images it built or pulled
declare -A MIGRATE_IMAGES=(
  [monitor]="localhost/pi-monitor:latest"
  [maps]="localhost/offline-maps:latest"
  [knowledge]="localhost/offline-knowledge:latest ghcr.io/kiwix/kiwix-serve:3.8.2"
  [mesh]="localhost/offline-pi-mesh:latest"
  [mesh-map]="localhost/offline-pi-mesh-map:latest"
)
# migrate in this order so mesh-map doesn't override the maps paths
MIGRATE_ORDER=(monitor maps knowledge mesh mesh-map)

# old_env_value FILE VAR - VAR from an old .env (read, not sourced).
old_env_value() {
  local v
  v="$(sed -n "s/^${2}=//p" "$1" | tail -n 1)"
  v="${v%\"}"; v="${v#\"}"
  printf '%s' "$v"
}

# remove_old_containers APP - containers of the old compose project (by the
# images that project used; never the new offline-pi-* containers).
remove_old_containers() {
  local app="$1" image id name
  for image in ${MIGRATE_IMAGES[$app]}; do
    podman image exists "$image" 2>/dev/null || continue
    while read -r id name; do
      [[ -z "$id" || "$name" == offline-pi-* ]] && continue
      podman rm -f "$id" >/dev/null && log_ok "Removed old container $name"
    done < <(podman ps -a --filter "ancestor=$image" --format '{{.ID}} {{.Names}}')
  done
  # pods/networks of the old project, if podman-compose created any
  podman pod rm -f "pod_${app}" >/dev/null 2>&1 || true
  podman network rm "${app}_default" >/dev/null 2>&1 || true
}

# migrate_old_apps [fresh] - see the header. "fresh": .env was just created
# from .env.example, so MODULES starts empty and lists exactly the old apps.
# Safe to re-run: migrated apps have no .env any more.
migrate_old_apps() {
  local fresh="${1:-}" app dir env pair old new kind value module modules found=false
  for app in "${MIGRATE_ORDER[@]}"; do
    dir="$ROOT_DIR/apps/$app"
    env="$dir/.env"
    [[ -f "$env" ]] || continue
    if [[ "$found" == false ]]; then
      log_info "Found an installation of the old per-app layout (apps/*); adopting it."
      found=true
      [[ "$fresh" == fresh ]] && set_env MODULES ""
    fi

    for pair in ${MIGRATE_VARS[$app]}; do
      IFS=: read -r old new kind <<<"$pair"
      value="$(old_env_value "$env" "$old")"
      [[ -n "$value" ]] || continue
      if [[ "$kind" == dir && "$value" != /* ]]; then
        value="$dir/${value#./}"
      fi
      # mesh-map only fills the maps paths when maps itself wasn't installed
      if [[ "$app" == mesh-map && -f "$dir/../maps/.env.migrated" ]]; then
        continue
      fi
      set_env "$new" "$value"
    done

    module="${MIGRATE_MODULE[$app]}"
    if [[ -n "$module" ]]; then
      modules="$(get_env MODULES)"
      if [[ ",$modules," != *",$module,"* ]]; then
        set_env MODULES "${modules:+$modules,}$module"
      fi
    fi

    if has_cmd podman; then
      remove_old_containers "$app"
    fi
    mv "$env" "$env.migrated"
    log_ok "Adopted apps/$app (its settings are in .env now; old file kept as apps/$app/.env.migrated)"
  done

  if [[ "$found" == true ]]; then
    for app in "${MIGRATE_ORDER[@]}"; do
      for value in ${MIGRATE_IMAGES[$app]}; do
        # mesh and mesh-map keep their image names; they are rebuilt anyway
        [[ "$value" == *offline-pi-mesh* ]] && continue
        if podman image exists "$value" 2>/dev/null && podman rmi "$value" >/dev/null 2>&1; then
          log_ok "Removed old image $value"
        fi
      done
    done
    log_info "The old data stays where it is; the storage questions below default to it and can move it."
  fi
}
