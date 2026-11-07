#!/usr/bin/env bash
# lib/download.sh - resumable, checksum-verified downloads via aria2c + Kiwix metalink files
set -euo pipefail

# Downloads a single ZIM given its .meta4 metalink URL into $2 (target dir).
# aria2c natively parses the metalink: picks mirrors, resumes partial downloads,
# and verifies the SHA-256/SHA-1 hash embedded in the .meta4 file.
#
# Downloads land in a sibling staging dir ("<target>/../.partial") and are only
# moved into the target dir once complete and verified, so kiwix-serve (which
# serves every *.zim in the target dir) never picks up a half-written file.
download_zim() {
  local meta4_url="$1"
  local target_dir="$2"
  local fname staging_dir

  fname="$(basename "${meta4_url%.meta4}")"
  mkdir -p "$target_dir"
  staging_dir="$(cd "$target_dir/.." && pwd)/.partial"
  mkdir -p "$staging_dir"

  if [[ -f "$target_dir/$fname" && ! -f "$target_dir/$fname.aria2" ]]; then
    log_ok "Already installed: $fname"
    return 0
  fi

  log_info "Downloading: $fname"

  aria2c \
    --dir="$staging_dir" \
    --continue=true \
    --check-integrity=true \
    --max-connection-per-server=4 \
    --split=4 \
    --summary-interval=5 \
    --console-log-level=warn \
    --show-console-readout=true \
    --file-allocation=none \
    --follow-metalink=mem \
    "$meta4_url"

  mv -f "$staging_dir/$fname" "$target_dir/$fname"
  log_ok "Installed: $fname"
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
