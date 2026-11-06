#!/usr/bin/env bash
# lib/catalog.sh - fetch & parse the Kiwix OPDS catalog
set -euo pipefail

CATALOG_URL="https://library.kiwix.org/catalog/v2/entries?count=100000"
CATALOG_CACHE_TTL_SECONDS="${CATALOG_CACHE_TTL_SECONDS:-86400}"

# Fetch the catalog XML into $1 (cache file path), re-using cache if fresh.
catalog_fetch() {
  local cache_file="$1"
  mkdir -p "$(dirname "$cache_file")"

  if [[ -f "$cache_file" ]]; then
    local age
    age=$(( $(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || echo 0) ))
    if (( age < CATALOG_CACHE_TTL_SECONDS )); then
      log_info "Using cached catalog (age: ${age}s)"
      return 0
    fi
  fi

  log_info "Fetching Kiwix catalog (this can take a moment)..."
  curl -fsSL "$CATALOG_URL" -o "${cache_file}.tmp"
  mv "${cache_file}.tmp" "$cache_file"
  log_ok "Catalog downloaded"
}

# Parse the catalog XML into tab-separated rows:
# name<TAB>title<TAB>language<TAB>category<TAB>size_bytes<TAB>zim_url<TAB>updated
# Writes to $2 (output tsv path), reading from $1 (catalog xml path).
catalog_parse() {
  local xml_file="$1"
  local out_file="$2"

  xmlstarlet sel -N a="http://www.w3.org/2005/Atom" \
    -N opds="https://specs.opds.io/opds-1.2" \
    -t -m "//a:entry" \
    -v "a:name" -o $'\t' \
    -v "a:title" -o $'\t' \
    -v "a:language" -o $'\t' \
    -v "a:category" -o $'\t' \
    -v "a:link[@type='application/x-zim']/@length" -o $'\t' \
    -v "a:link[@type='application/x-zim']/@href" -o $'\t' \
    -v "a:updated" \
    -n \
    "$xml_file" > "$out_file"
}

# Human readable size from bytes.
human_size() {
  local bytes="$1"
  awk -v b="$bytes" 'BEGIN {
    split("B KB MB GB TB", units, " ")
    u = 1
    while (b >= 1024 && u < 5) { b /= 1024; u++ }
    printf "%.1f %s", b, units[u]
  }'
}
