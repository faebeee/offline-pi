#!/usr/bin/env bash
# install.sh - first-time setup: build the image and bootstrap the server
# (installs the pmtiles CLI, vendors fonts/sprites). Safe to re-run.
#
# Unlike other settings, DATA_DIR/ASSETS_DIR are re-prompted on every run
# (defaulting to the current value) so re-running this script is also the
# supported way to relocate storage to a newly mounted external SSD. If the
# answer differs from what's already in .env, existing data is resynced to
# the new location before .env is updated.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }

# compose - run the available podman compose backend with the given args.
# Prefers the built-in `podman compose` subcommand, falls back to the
# standalone `podman-compose` binary.
compose() {
  if podman compose version >/dev/null 2>&1; then
    podman compose "$@"
  else
    podman-compose "$@"
  fi
}

if ! command -v podman >/dev/null 2>&1; then
  log_error "podman is required. Install it (e.g. 'sudo apt install podman') and re-run."
  exit 1
fi
if ! podman compose version >/dev/null 2>&1 && ! command -v podman-compose >/dev/null 2>&1; then
  log_error "No compose backend found. Install 'podman-compose' (or a podman with the 'compose' subcommand) and re-run."
  exit 1
fi

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

if [[ -f "$ENV_FILE" ]]; then
  log_ok "Found existing .env"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
else
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  log_ok "Wrote $ENV_FILE with defaults — edit it to change PORT/ALLOWED_ORIGINS/DATABASE_URL/DB_LOGGING."
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# resync_dir - if $1 (old path, may be unset/empty) differs from $2 (new
# path) and the old path has content, move it to the new path (copy then
# remove, so a cross-device move to e.g. a freshly mounted SSD is safe).
# Aborts the whole script on failure rather than risk losing data.
resync_dir() {
  local old="$1" new="$2" label="$3"

  mkdir -p "$new"
  if ! [[ -w "$new" ]]; then
    log_error "'$new' is not writable. Fix permissions/mount it and re-run."
    exit 1
  fi

  if [[ -z "$old" || "$old" == "$new" ]]; then
    return
  fi
  if [[ ! -d "$old" ]] || [[ -z "$(ls -A "$old" 2>/dev/null)" ]]; then
    return
  fi

  log_warn "$label location changed: $old -> $new"
  local reply
  read -r -p "Move existing contents of '$old' to '$new' now? [Y/n]: " reply
  reply="${reply:-Y}"
  if [[ ! "$reply" =~ ^[Yy] ]]; then
    log_warn "Skipped moving $label; it will stay at '$old' until you move it yourself."
    return
  fi

  log_info "Moving $label from '$old' to '$new'..."
  if command -v rsync >/dev/null 2>&1; then
    if ! rsync -a --remove-source-files "$old"/ "$new"/; then
      log_error "Failed to move $label to '$new'. Nothing was changed in .env; fix the issue and re-run."
      exit 1
    fi
    find "$old" -depth -type d -empty -delete 2>/dev/null || true
  else
    if ! cp -a "$old"/. "$new"/; then
      log_error "Failed to copy $label to '$new'. Nothing was changed in .env; fix the issue and re-run."
      exit 1
    fi
    rm -rf "$old"
  fi
  log_ok "$label moved to '$new'"
}

prompt_dir() {
  local prompt_text="$1" current="$2" answer
  read -r -p "$prompt_text [$current]: " answer
  answer="${answer:-$current}"
  # Expand to an absolute path, creating it first if needed.
  mkdir -p "$answer"
  (cd "$answer" && pwd)
}

old_data_dir="${DATA_DIR:-./data}"
old_assets_dir="${ASSETS_DIR:-./assets}"

new_data_dir="$(prompt_dir "Where should map data (regions, POIs) be stored?" "$old_data_dir")"
new_assets_dir="$(prompt_dir "Where should vendored fonts/sprites be stored?" "$old_assets_dir")"

resync_dir "$old_data_dir" "$new_data_dir" "map data"
resync_dir "$old_assets_dir" "$new_assets_dir" "assets"

sed -i "s#^DATA_DIR=.*#DATA_DIR=${new_data_dir}#" "$ENV_FILE"
sed -i "s#^ASSETS_DIR=.*#ASSETS_DIR=${new_assets_dir}#" "$ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"
log_ok "DATA_DIR=$DATA_DIR, ASSETS_DIR=$ASSETS_DIR"

# $DATA_DIR/regions and $ASSETS_DIR are bind-mounted into the container as
# uid 1000 (node); creating them first keeps them owned by the current user
# on Linux.
mkdir -p "$DATA_DIR/regions" "$ASSETS_DIR"
log_ok "data and assets directories ready"

log_info "Building the offline-maps image..."
compose build

log_info "Running first-run setup (pmtiles CLI, fonts, sprites)..."
compose run --rm offline-maps node apps/backend/dist/cli/main.js setup

log_ok "Install complete."
exec "$SCRIPT_DIR/start.sh"
