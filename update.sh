#!/usr/bin/env bash
# update.sh - install the newest release of outpost: move the checkout to
# its tag (v<version>, releases only, never the head of main), then run
# the new version's ./install.sh --yes, which keeps every answer, downloads
# the new images and recreates every container. Data and settings (.env)
# are kept; settings a new version adds are listed with their defaults.
#
#   ./update.sh [--check] [--yes] [--clean] [--rebuild]
#     --check     only show whether a new release is available
#     --yes       don't ask before updating
#     --clean     build every image here, from scratch (slow on a Pi)
#     --rebuild   reinstall even when already up to date
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
  install_flags=(--yes)
  [[ "$clean" == true ]] && install_flags+=(--no-cache)
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
  log_info "Installing the new version (your answers are kept)..."
  exec "$ROOT_DIR/install.sh" "${install_flags[@]}"
fi

# --------------------------------------------------------- 1. pull (old) --
require_git_checkout
fetch_upstream

if [[ -z "$TARGET" ]]; then
  log_ok "No release of outpost is published yet; nothing to update ($(version HEAD))."
  exit 0
fi

if (( AHEAD > 0 && BEHIND > 0 )); then
  log_error "This checkout and the release $TARGET have both changed ($AHEAD local, $BEHIND new commits)."
  echo "  Merge or rebase them by hand ('git rebase $TARGET'), then run ./start.sh." >&2
  exit 1
fi

if (( BEHIND == 0 )); then
  if (( AHEAD > 0 )); then
    # installed from main (or with local commits) after the newest release
    log_ok "outpost is newer than the newest release $TARGET: $(version HEAD). The next release will update it."
  else
    log_ok "outpost is up to date: $(version HEAD)."
  fi
  [[ "$check" == true ]] && exit 0
  if [[ "$rebuild" != true ]]; then
    if [[ "$yes" == true ]]; then exit 0; fi
    ui_confirm "Reinstall it anyway?" n || exit 0
  fi
  exec "$ROOT_DIR/update.sh" --apply "$(git rev-parse HEAD)" $([[ "$clean" == true ]] && echo --clean)
fi

show_incoming
if [[ "$check" == true ]]; then
  echo "Run ./update.sh to install it."
  exit 0
fi

if [[ "$yes" != true ]]; then
  echo "The update downloads the new images and recreates every container:"
  echo "outpost is unavailable for a few minutes. Data and settings are kept."
  if ! ui_confirm "Install the update now?" y; then
    log_info "Nothing changed."
    exit 0
  fi
fi

old="$(git rev-parse HEAD)"
# the tag's commit (merging an annotated tag itself could make a merge commit)
if ! git merge --ff-only --quiet "$(git rev-parse "$TARGET^{commit}")"; then
  log_error "Could not apply the update (git merge --ff-only $TARGET failed); nothing changed."
  exit 1
fi

# hand over to the new version's update.sh for the rest
exec "$ROOT_DIR/update.sh" --apply "$old" $([[ "$clean" == true ]] && echo --clean)
