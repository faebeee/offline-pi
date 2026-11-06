#!/usr/bin/env bash
# lib/download.sh - resumable, checksum-verified downloads via aria2c + Kiwix metalink files
set -euo pipefail

# Downloads a single ZIM given its .meta4 metalink URL into $2 (target dir).
# aria2c natively parses the metalink: picks mirrors, resumes partial downloads,
# and verifies the SHA-256/SHA-1 hash embedded in the .meta4 file.
download_zim() {
  local meta4_url="$1"
  local target_dir="$2"

  mkdir -p "$target_dir"
  log_info "Downloading: $(basename "${meta4_url%.meta4}")"

  aria2c \
    --dir="$target_dir" \
    --continue=true \
    --check-integrity=true \
    --max-connection-per-server=4 \
    --split=4 \
    --summary-interval=5 \
    --console-log-level=warn \
    --show-console-readout=true \
    "$meta4_url"
}

# Downloads multiple ZIMs given a newline-separated list of meta4 URLs.
download_zim_batch() {
  local target_dir="$1"
  shift
  local url
  for url in "$@"; do
    download_zim "$url" "$target_dir"
  done
}
