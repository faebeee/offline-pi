#!/usr/bin/env bash
# uninstall.sh - remove offline-maps: containers and image always; data and .env
# only after confirmation (or with --purge). See ./uninstall.sh --help.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ------------------------------------------------------------ app config --
APP_NAME="offline-maps"
# Images to remove (locally built and/or pulled upstream ones).
IMAGES=(localhost/offline-maps:latest)
# Persistent data directories as VAR=default (same vars as .env).
DATA_DIR_VARS=(DATA_DIR=./data ASSETS_DIR=./assets)

# ------------------------------------------------------------------------
# Everything below is identical in every app's uninstall.sh; only the
# config block above changes (see AGENTS.md).
# ------------------------------------------------------------------------

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

# compose - run the available podman compose backend with the given args.
compose() {
  if podman compose version >/dev/null 2>&1; then
    podman compose "$@"
  else
    podman-compose "$@"
  fi
}

usage() {
  cat <<USAGE
Usage: ./uninstall.sh [--purge] [--yes]

Stops and removes the $APP_NAME containers and image. Persistent data is
kept unless you confirm deleting it (or pass --purge).

  --purge   also delete the data directories and .env (asks once, unless --yes)
  --yes     don't ask; without --purge the data is kept
USAGE
}

PURGE=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    -y|--yes) ASSUME_YES=true ;;
    -h|--help) usage; exit 0 ;;
    *) log_error "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

# confirm QUESTION DEFAULT(y|n) - plain read, so it works even if the app's
# dependencies (gum etc.) are already gone. --yes answers the default, so
# "delete data?" (default n) stays no unless --purge was given.
confirm() {
  local question="$1" default="$2" hint reply
  if [[ "$ASSUME_YES" == true ]]; then
    [[ "$default" == y ]]
    return
  fi
  if [[ "$default" == y ]]; then hint="[Y/n]"; else hint="[y/N]"; fi
  read -r -p "$question $hint " reply
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy] ]]
}

ENV_FILE="$SCRIPT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# Resolve every data directory (from .env, else its default) to an absolute
# path, relative paths being relative to the app directory.
declare -a DATA_PATHS=()
for entry in "${DATA_DIR_VARS[@]}"; do
  var="${entry%%=*}"
  default="${entry#*=}"
  path="${!var:-$default}"
  [[ "$path" != /* ]] && path="$SCRIPT_DIR/${path#./}"
  DATA_PATHS+=("$var=$path")
done

echo
log_info "This removes $APP_NAME from this machine:"
echo "  - stops and removes its containers"
echo "  - removes the image(s): ${IMAGES[*]}"
for entry in "${DATA_PATHS[@]}"; do
  if [[ "$PURGE" == true ]]; then
    echo "  - DELETES ${entry%%=*}: ${entry#*=}"
  else
    echo "  - keeps ${entry%%=*}: ${entry#*=} (you'll be asked)"
  fi
done
echo "The source checkout, Podman itself, podman-restart.service and lingering"
echo "are left alone (other apps may use them)."
echo
if [[ "$ASSUME_YES" != true ]] && ! confirm "Uninstall $APP_NAME?" n; then
  log_warn "Cancelled; nothing was changed."
  exit 0
fi

# ------------------------------------------------------------ containers --
if command -v podman >/dev/null 2>&1; then
  log_info "Stopping and removing containers..."
  if [[ -f "$ENV_FILE" ]]; then
    compose --env-file "$ENV_FILE" down || log_warn "compose down reported an error; continuing."
  else
    compose down || log_warn "compose down reported an error; continuing."
  fi

  for image in "${IMAGES[@]}"; do
    if podman image exists "$image" 2>/dev/null; then
      if podman rmi "$image" >/dev/null; then
        log_ok "Removed image $image"
      else
        log_warn "Could not remove image $image (still used by another container?)."
      fi
    fi
  done
else
  log_warn "podman not found; skipping container and image removal."
fi

# ------------------------------------------------------------------ data --
all_deleted=true
for entry in "${DATA_PATHS[@]}"; do
  var="${entry%%=*}"
  path="${entry#*=}"
  if [[ ! -d "$path" ]]; then
    continue
  fi
  path="$(cd "$path" && pwd)"
  # Never rm -rf something that obviously isn't app data, nor the app
  # checkout itself or anything containing it (e.g. DATA_DIR=.).
  if [[ "$SCRIPT_DIR/" == "$path"/* ]]; then
    log_error "Refusing to delete $var='$path': it contains the app itself."
    all_deleted=false
    continue
  fi
  case "$path" in
    /|"$HOME"|"$HOME/"|/home|/media|/mnt|/srv|/var|/usr|/etc)
      log_error "Refusing to delete $var='$path'; remove it yourself if you really mean it."
      all_deleted=false
      continue
      ;;
  esac
  size="$(du -sh "$path" 2>/dev/null | cut -f1)"
  delete=false
  if [[ "$PURGE" == true ]]; then
    delete=true
  elif confirm "Delete $var '$path' (${size:-?})? This cannot be undone." n; then
    delete=true
  fi
  if [[ "$delete" == true ]]; then
    if rm -rf "$path"; then
      log_ok "Deleted $path"
    else
      log_error "Could not fully delete '$path'."
      all_deleted=false
    fi
  else
    log_ok "Kept $var at $path"
    all_deleted=false
  fi
done

# .env points at the data; keep it while any data is kept so a later
# ./install.sh picks the same locations up again.
if [[ -f "$ENV_FILE" ]]; then
  if [[ "$all_deleted" == true ]]; then
    rm -f "$ENV_FILE"
    log_ok "Removed .env"
  else
    log_info "Kept .env (it points at the kept data)."
  fi
fi

echo
log_ok "$APP_NAME uninstalled."
echo "Run ./install.sh to install it again. Leftover build layers can be"
echo "cleaned up with 'podman image prune'."
