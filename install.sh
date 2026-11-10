#!/usr/bin/env bash
# install.sh - set up offline-pi: check dependencies, write .env, choose and
# configure the modules, build the images, then start everything. Safe to
# re-run: it is also how you add/remove modules, move data to an SSD (every
# *_DIR is re-asked, defaulting to the current value) or reconfigure a module.
# Runs on a Raspberry Pi / Linux and on macOS (Podman machine).
#
#   ./install.sh [--yes] [--plain] [--verbose]
#     --yes      don't ask: keep the current answers (defaults on a first run)
#     --plain    line-by-line prompts instead of menus (also without a terminal)
#     --verbose  show the build output instead of a progress line
#
# Also adopts an installation of the old per-app layout (apps/*/.env), see
# lib/migrate.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

for arg in "$@"; do
  case "$arg" in
    -y|--yes) export UI_ASSUME_YES=true ;;
    --plain) export UI_PLAIN=true ;;
    -v|--verbose) export UI_VERBOSE=true ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see ./install.sh --help)" >&2; exit 1 ;;
  esac
done
# every step's full output (builds, downloads); start.sh appends to it
export UI_LOG="$ROOT_DIR/install.log"
: >"$UI_LOG"

# shellcheck source=lib/common.sh
source "$ROOT_DIR/lib/common.sh"
# shellcheck source=lib/storage.sh
source "$ROOT_DIR/lib/storage.sh"
# shellcheck source=lib/serial.sh
source "$ROOT_DIR/lib/serial.sh"
# shellcheck source=lib/modules.sh
source "$ROOT_DIR/lib/modules.sh"
# shellcheck source=lib/migrate.sh
source "$ROOT_DIR/lib/migrate.sh"
# shellcheck source=lib/install.sh
source "$ROOT_DIR/lib/install.sh"
load_module_hooks

STEPS=5
ui_banner "offline-pi" "installer $UI_DOT $(platform_label)"

# ---------------------------------------------------------- 1. the system --
ui_step 1 "$STEPS" "System check"
ensure_podman

fresh=false
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  fresh=true
fi
if [[ "$fresh" == true ]]; then
  migrate_old_apps fresh
else
  migrate_old_apps
fi
install_host_check

# ------------------------------------------------------------- 2. basics --
ui_step 2 "$STEPS" "Web app"
install_basics "$fresh"

# ------------------------------------------------------------ 3. modules --
ui_step 3 "$STEPS" "Modules"
install_choose_modules
read_lines MODS installed_modules

# ------------------------------------------------- 4. module configuration --
ui_step 4 "$STEPS" "Storage and settings"
ui_note "Directories that grow can live on an SSD, e.g. /mnt/ssd/offline-pi/maps."
ui_note "Changing one offers to move what is already there."
core_configure
for m in ${MODS[@]+"${MODS[@]}"}; do
  run_hook "$m" configure || [[ $? -eq 127 ]] || exit 1
done

# -------------------------------------------------------------- 5. build --
ui_step 5 "$STEPS" "Build and start"
install_summary ${MODS[@]+"${MODS[@]}"}
if ! ui_confirm "Build and start offline-pi now?" y; then
  log_info "Settings saved in .env. Run ./install.sh again to build and start."
  exit 0
fi

prepare_builds core ${MODS[@]+"${MODS[@]}"}
is_pi && ui_note "The first build takes a while on a Pi (10-30 minutes); later ones reuse the cache."
for m in core ${MODS[@]+"${MODS[@]}"}; do
  if [[ "$m" == core ]]; then label="Dashboard and web app"; else label="$(module_label "$m")"; fi
  if ! ui_run "Building $label" compose build "$m"; then
    log_error "Building $label failed; nothing was started. Fix the error above and re-run ./install.sh."
    exit 1
  fi
done
for m in ${MODS[@]+"${MODS[@]}"}; do
  if declare -F "${m//-/_}_post_build" >/dev/null; then
    ui_run "Setting up $(module_label "$m")" run_hook "$m" post_build || exit 1
  fi
done

ensure_autostart

log_ok "Install complete."
exec "$ROOT_DIR/start.sh"
