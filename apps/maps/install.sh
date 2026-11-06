#!/usr/bin/env bash
# install.sh - first-time setup: build the image and bootstrap the server
# (installs the pmtiles CLI, vendors fonts/sprites). Safe to re-run.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
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

# data/ and assets/ are bind-mounted into the container as uid 1000 (node);
# creating them first keeps them owned by the current user on Linux.
mkdir -p data/regions assets
log_ok "data/ and assets/ ready"

log_info "Building the offline-maps image..."
compose build

log_info "Running first-run setup (pmtiles CLI, fonts, sprites)..."
compose run --rm offline-maps node apps/backend/dist/cli/main.js setup

log_ok "Install complete. Run ./start.sh to bring the server up."
