#!/usr/bin/env bash
# install.sh - interactive installer for the offline Kiwix knowledge box
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# shellcheck source=lib/deps.sh
source "$SCRIPT_DIR/lib/deps.sh"
# shellcheck source=lib/catalog.sh
source "$SCRIPT_DIR/lib/catalog.sh"
# shellcheck source=lib/ui.sh
source "$SCRIPT_DIR/lib/ui.sh"
# shellcheck source=lib/diskcheck.sh
source "$SCRIPT_DIR/lib/diskcheck.sh"
# shellcheck source=lib/download.sh
source "$SCRIPT_DIR/lib/download.sh"

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

  local content_dir
  read -r -p "Where should ZIM files & content be stored? [./data]: " content_dir
  content_dir="${content_dir:-./data}"
  # Expand to absolute path
  content_dir="$(mkdir -p "$content_dir" && cd "$content_dir" && pwd)"

  if [[ ! -w "$content_dir" ]]; then
    log_error "'$content_dir' is not writable. Fix permissions and re-run."
    exit 1
  fi
  mkdir -p "$content_dir/zim"

  local port
  read -r -p "Port for kiwix-serve [8080]: " port
  port="${port:-8080}"

  local bind
  read -r -p "Bind address (all/ipv4/ipv6/specific IP) [all]: " bind
  bind="${bind:-all}"

  sed -i "s#^CONTENT_DIR=.*#CONTENT_DIR=${content_dir}#" "$ENV_FILE"
  sed -i "s#^KIWIX_PORT=.*#KIWIX_PORT=${port}#" "$ENV_FILE"
  sed -i "s#^BIND_ADDRESS=.*#BIND_ADDRESS=${bind}#" "$ENV_FILE"

  # shellcheck disable=SC1090
  source "$ENV_FILE"
  log_ok "Wrote $ENV_FILE"
}

setup_env_file
mkdir -p "$CONTENT_DIR/zim"

# ---------------------------------------------------------------------------
# Step 3: fetch & parse catalog
# ---------------------------------------------------------------------------
CACHE_DIR="$CONTENT_DIR/.cache"
CATALOG_XML="$CACHE_DIR/catalog.xml"
CATALOG_TSV="$CACHE_DIR/catalog.tsv"

catalog_fetch "$CATALOG_XML"
catalog_parse "$CATALOG_XML" "$CATALOG_TSV"

total_entries=$(wc -l < "$CATALOG_TSV")
log_ok "Catalog loaded: $total_entries topics available"

# ---------------------------------------------------------------------------
# Step 4: optional language filter + topic selection
# ---------------------------------------------------------------------------
read -r -p "Filter by language code (e.g. eng, fra) or leave blank for all: " lang_filter

log_info "Opening topic picker..."
selected_tsv="$CACHE_DIR/selected.tsv"
if ! ui_select_topics "$CATALOG_TSV" "$lang_filter" > "$selected_tsv"; then
  log_warn "No topics selected. Exiting."
  exit 0
fi

selected_count=$(wc -l < "$selected_tsv")
log_ok "$selected_count topic(s) selected"

# ---------------------------------------------------------------------------
# Step 5: disk space check
# ---------------------------------------------------------------------------
total_bytes=0
while IFS=$'\t' read -r name title lang category size url updated; do
  total_bytes=$(( total_bytes + size ))
done < "$selected_tsv"

log_info "Total download size: $(human_size "$total_bytes")"

if ! disk_check_sufficient "$CONTENT_DIR" "$total_bytes"; then
  log_error "Aborting due to insufficient disk space. Re-run and select fewer/smaller topics."
  exit 1
fi

if ! ui_confirm "Proceed with downloading $selected_count topic(s) ($(human_size "$total_bytes"))?"; then
  log_warn "Cancelled by user."
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 6: download
# ---------------------------------------------------------------------------
while IFS=$'\t' read -r name title lang category size url updated; do
  download_zim "$url" "$CONTENT_DIR/zim"
done < "$selected_tsv"

log_ok "All downloads complete."

# ---------------------------------------------------------------------------
# Step 7: start kiwix-serve via docker compose
# ---------------------------------------------------------------------------
log_info "Starting kiwix-serve..."
docker compose --env-file "$ENV_FILE" up -d

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
log_ok "Kiwix is up and running!"
echo "  Local:   http://localhost:${KIWIX_PORT}"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN:     http://${LAN_IP}:${KIWIX_PORT}"
fi
echo
echo "Use ./manage.sh to add more topics, check status, update, or remove content."
