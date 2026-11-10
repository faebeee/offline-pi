#!/usr/bin/env bash
# update.sh - install a new version of outpost: pull it from git, then
# rebuild every image (with fresh base images) and recreate every container.
# Data and settings (.env) are kept; settings a new version adds are listed
# with their defaults.
#
#   ./update.sh [--check] [--yes] [--clean] [--rebuild]
#     --check     only show whether a new version is available
#     --yes       don't ask before updating
#     --clean     rebuild every image from scratch (no layer cache; slower)
#     --rebuild   rebuild and recreate everything even when already up to date
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/update.sh
source "$ROOT_DIR/lib/update.sh"

check=false yes=false clean=false rebuild=false apply_from=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) check=true ;;
    --yes|-y) yes=true ;;
    --clean) clean=true ;;
    --rebuild) rebuild=true ;;
    # internal: the second half, run by the *new* update.sh after the pull
    --apply) apply_from="${2:?}"; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) log_error "Unknown option: $1 (see ./update.sh --help)"; exit 1 ;;
  esac
  shift
done

if [[ ! -f "$ENV_FILE" ]]; then
  log_error "outpost is not installed here yet: run ./install.sh."
  exit 1
fi

# ------------------------------------------------------- 2. rebuild (new) --
# Runs from the freshly pulled update.sh, so a changed update procedure
# applies to this very update.
if [[ -n "$apply_from" ]]; then
  read_lines new_settings new_env_settings "$apply_from"
  start_flags=(--pull)
  [[ "$clean" == true ]] && start_flags+=(--no-cache)
  if [[ "$apply_from" != "$(git rev-parse HEAD)" ]]; then
    log_ok "Updated $(version "$apply_from") -> $(version HEAD)"
    echo "  Something wrong with the new version? Go back with:"
    echo "    git reset --hard $(git rev-parse --short "$apply_from") && ./start.sh"
    echo "  What's new: docs/07-changelog.md, or Info > Changelog in the app."
  fi
  if [[ ${#new_settings[@]} -gt 0 ]]; then
    log_info "New settings in this version, using their defaults (see .env.example):"
    printf '    %s\n' "${new_settings[@]}"
    echo "  To change one, edit .env and run ./start.sh, or re-run ./install.sh."
  fi
  log_info "Rebuilding every image and recreating every container..."
  exec "$ROOT_DIR/start.sh" "${start_flags[@]}"
fi

# --------------------------------------------------------- 1. pull (old) --
require_git_checkout
fetch_upstream

if (( AHEAD > 0 && BEHIND > 0 )); then
  log_error "This checkout and $UPSTREAM have both changed ($AHEAD local, $BEHIND new commits)."
  echo "  Merge or rebase them by hand ('git pull --rebase'), then run ./start.sh." >&2
  exit 1
fi

if (( BEHIND == 0 )); then
  log_ok "outpost is up to date: $(version HEAD)."
  [[ "$check" == true ]] && exit 0
  if [[ "$rebuild" != true ]]; then
    if [[ "$yes" == true ]]; then exit 0; fi
    ui_confirm "Rebuild and recreate every container anyway?" n || exit 0
  fi
  exec "$ROOT_DIR/update.sh" --apply "$(git rev-parse HEAD)" $([[ "$clean" == true ]] && echo --clean)
fi

show_incoming
if [[ "$check" == true ]]; then
  echo "Run ./update.sh to install it."
  exit 0
fi

if [[ "$yes" != true ]]; then
  echo "The update rebuilds every image and recreates every container: the"
  echo "modules are unavailable for a few minutes. Data and settings are kept."
  if ! ui_confirm "Install the update now?" y; then
    log_info "Nothing changed."
    exit 0
  fi
fi

old="$(git rev-parse HEAD)"
if ! git merge --ff-only --quiet "$UPSTREAM"; then
  log_error "Could not apply the update (git merge --ff-only $UPSTREAM failed); nothing changed."
  exit 1
fi

# hand over to the new version's update.sh for the rest
exec "$ROOT_DIR/update.sh" --apply "$old" $([[ "$clean" == true ]] && echo --clean)
