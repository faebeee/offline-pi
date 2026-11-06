#!/usr/bin/env bash
# lib/diskcheck.sh - free space checks
set -euo pipefail

# Returns available bytes at the filesystem containing $1.
disk_free_bytes() {
  local path="$1"
  mkdir -p "$path"
  df --output=avail -B1 "$path" | tail -1 | tr -d ' '
}

# Checks whether $2 bytes are available at path $1, with a safety margin (default 5%).
# Returns 0 if OK, 1 if insufficient.
disk_check_sufficient() {
  local path="$1"
  local required_bytes="$2"
  local margin_pct="${3:-5}"

  local avail required_with_margin
  avail=$(disk_free_bytes "$path")
  required_with_margin=$(( required_bytes + required_bytes * margin_pct / 100 ))

  if (( avail >= required_with_margin )); then
    return 0
  else
    log_error "Insufficient disk space at '$path': need ~$(human_size "$required_with_margin"), only $(human_size "$avail") available."
    return 1
  fi
}
