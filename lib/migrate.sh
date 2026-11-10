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

# Plain functions instead of associative arrays (Bash 3.2 on macOS has none).

# migrate_module APP - the module an old app dir became (empty: core).
migrate_module() {
  case "$1" in
    monitor) echo "" ;;
    mesh-map) echo "maps" ;;  # the node map is a layer of Maps now
    *) echo "$1" ;;
  esac
}

# migrate_vars APP - "OLD_VAR:NEW_VAR ..." (":dir" suffix = a path to resolve).
migrate_vars() {
  case "$1" in
    monitor) echo "DATA_DIR:CORE_DATA_DIR:dir PORT:PORT BIND_ADDRESS:BIND_ADDRESS SAMPLE_INTERVAL_MS:SAMPLE_INTERVAL_MS" ;;
    maps) echo "DATA_DIR:MAPS_DATA_DIR:dir ASSETS_DIR:MAPS_ASSETS_DIR:dir ALLOWED_ORIGINS:MAPS_ALLOWED_ORIGINS DATABASE_URL:MAPS_DATABASE_URL DB_LOGGING:MAPS_DB_LOGGING" ;;
    knowledge) echo "CONTENT_DIR:KNOWLEDGE_CONTENT_DIR:dir AUTO_SYNC:KNOWLEDGE_AUTO_SYNC" ;;
    mesh) echo "DATA_DIR:MESH_DATA_DIR:dir MESH_CONNECTION:MESH_CONNECTION MESH_DEVICE:MESH_DEVICE MESH_HOST:MESH_HOST SEND_PIN:MESH_SEND_PIN SEND_RATE_LIMIT:MESH_SEND_RATE_LIMIT" ;;
    mesh-map) echo "MAPS_DATA_DIR:MAPS_DATA_DIR:dir MAPS_ASSETS_DIR:MAPS_ASSETS_DIR:dir" ;;
  esac
}

# migrate_images APP - images the old app built or pulled.
migrate_images() {
  case "$1" in
    monitor) echo "localhost/pi-monitor:latest" ;;
    maps) echo "localhost/offline-maps:latest" ;;
    knowledge) echo "localhost/offline-knowledge:latest ghcr.io/kiwix/kiwix-serve:3.8.2" ;;
    mesh) echo "localhost/offline-pi-mesh:latest" ;;
    mesh-map) echo "localhost/offline-pi-mesh-map:latest" ;;
  esac
}
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
# images that project used; never the containers of the single app).
remove_old_containers() {
  local app="$1" image id name
  for image in $(migrate_images "$app"); do
    podman image exists "$image" 2>/dev/null || continue
    while read -r id name; do
      [[ -z "$id" || "$name" == offline-pi-* || "$name" == outpost-* ]] && continue
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

    for pair in $(migrate_vars "$app"); do
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

    module="$(migrate_module "$app")"
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
      for value in $(migrate_images "$app"); do
        # mesh keeps its image name; it is rebuilt anyway
        [[ "$value" == *offline-pi-mesh:* ]] && continue
        if podman image exists "$value" 2>/dev/null && podman rmi "$value" >/dev/null 2>&1; then
          log_ok "Removed old image $value"
        fi
      done
    done
    log_info "The old data stays where it is; the storage questions below default to it and can move it."
  fi
}

# migrate_project_rename - the project was called offline-pi before it was
# renamed to outpost: remove the containers (offline-pi-*, core holds PORT)
# and images of that name, so the outpost-* ones can take over. Bind-mounted
# data stays where it is (.env still points at it). Safe to re-run.
migrate_project_rename() {
  local name image found=false
  has_cmd podman || return 0
  for name in $(podman ps -a --format '{{.Names}}' 2>/dev/null | grep '^offline-pi-' || true); do
    if [[ "$found" == false ]]; then
      log_info "Replacing the containers of the old project name (offline-pi) with outpost ones."
      found=true
    fi
    podman rm -f "$name" >/dev/null && log_ok "Removed old container $name"
  done
  for image in $(podman images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep '^localhost/offline-pi-' || true); do
    podman rmi "$image" >/dev/null 2>&1 && log_ok "Removed old image $image"
  done
  return 0
}
