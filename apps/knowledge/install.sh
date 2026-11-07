#!/usr/bin/env bash
# install.sh - installer for the offline emergency-knowledge box. Sets up
# .env and the storage location, builds the image and starts it; the
# container then downloads the ZIMs listed in zims.txt by itself.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/deps.sh
source "$SCRIPT_DIR/lib/deps.sh"

ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# ---------------------------------------------------------------------------
# Step 1: dependencies
# ---------------------------------------------------------------------------
log_info "Checking dependencies..."
ensure_all_deps

# ---------------------------------------------------------------------------
# Step 2: configuration (.env)
# ---------------------------------------------------------------------------
setup_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log_ok "Found existing .env"
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    return
  fi

  log_info "No .env found, let's set one up."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  local port
  read -r -p "Port for kiwix-serve [8082]: " port
  port="${port:-8082}"

  local bind
  read -r -p "Bind address (all/ipv4/ipv6) [all]: " bind
  bind="${bind:-all}"

  sed -i "s#^KIWIX_PORT=.*#KIWIX_PORT=${port}#" "$ENV_FILE"
  sed -i "s#^BIND_ADDRESS=.*#BIND_ADDRESS=${bind}#" "$ENV_FILE"

  # shellcheck disable=SC1090
  source "$ENV_FILE"
  log_ok "Wrote $ENV_FILE"
}

# setup_content_dir - CONTENT_DIR is re-prompted on every run (defaulting to
# the current value) so re-running install.sh is the supported way to move
# content to e.g. a newly mounted SSD. If the answer differs from the old
# value and the old dir has content, it is copied over (rsync, falling back to
# cp -a) before the old copy is removed and .env is updated. On failure both
# copies are left in place and .env is untouched.
setup_content_dir() {
  local old="${CONTENT_DIR:-./data}" new
  read -r -p "Where should ZIM files & content be stored? [$old]: " new
  new="${new:-$old}"
  if ! mkdir -p "$new" 2>/dev/null || ! new="$(cd "$new" && pwd)" || [[ ! -w "$new" ]]; then
    log_error "'$new' is not available or not writable (is the SSD mounted?). Fix it and re-run."
    exit 1
  fi

  local old_abs=""
  [[ -d "$old" ]] && old_abs="$(cd "$old" && pwd)"

  if [[ -n "$old_abs" && "$old_abs" != "$new" && -n "$(ls -A "$old_abs" 2>/dev/null)" ]]; then
    log_warn "Content location changed: $old_abs -> $new"
    local reply
    read -r -p "Move existing content from '$old_abs' to '$new' now? [Y/n] " reply
    if [[ ! "$reply" =~ ^[Nn] ]]; then
      log_info "Copying content to '$new'..."
      local ok=true
      if has_cmd rsync; then
        rsync -a --no-perms --no-owner --no-group "$old_abs"/ "$new"/ || ok=false
      else
        cp -r "$old_abs"/. "$new"/ || ok=false
      fi
      if [[ "$ok" != true ]]; then
        log_error "Copy failed. Both '$old_abs' and '$new' were left as they are and .env is unchanged; fix the issue and re-run ./install.sh."
        exit 1
      fi
      rm -rf "$old_abs"
      log_ok "Content moved to '$new'"
    else
      log_warn "Not moving content; it stays in '$old_abs'."
    fi
  fi

  sed -i "s#^CONTENT_DIR=.*#CONTENT_DIR=${new}#" "$ENV_FILE"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  log_ok "CONTENT_DIR=$CONTENT_DIR"
}

setup_env_file
setup_content_dir
mkdir -p "$CONTENT_DIR/zim"

# ---------------------------------------------------------------------------
# Step 3: build the image (bakes in zims.txt)
# ---------------------------------------------------------------------------
log_info "Building the image..."
compose --env-file "$ENV_FILE" build
log_ok "Image built"

ensure_autostart

# ---------------------------------------------------------------------------
# Step 4: start; the container downloads the ZIMs from zims.txt
# ---------------------------------------------------------------------------
exec "$SCRIPT_DIR/start.sh"
