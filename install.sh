#!/usr/bin/env bash
# install.sh - set up outpost: check Podman, choose modules and where the
# data goes, download the images, start everything and make it start at
# boot. Safe to re-run: it is also how you add or remove modules or move the
# data (e.g. to an SSD). Runs on a Raspberry Pi / Linux and on macOS.
#
#   ./install.sh [--advanced] [--yes] [--build] [--no-cache] [--plain] [--verbose]
#     --advanced  also ask for the port, who may connect, the control PIN,
#                 the Mesh send PIN and a folder per module
#     --yes       don't ask: keep the current answers (defaults on a first run)
#     --build     build the images here instead of downloading them
#     --no-cache  build them from scratch (implies --build)
#     --plain     line-by-line prompts instead of menus (also without a terminal)
#     --verbose   show the build/download output instead of a progress line
#
# Also adopts an installation of the old per-app layout (apps/*/.env), see
# lib/migrate.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ROOT_DIR="$SCRIPT_DIR"

for arg in "$@"; do
  case "$arg" in
    -a|--advanced) export INSTALL_ADVANCED=true ;;
    -y|--yes) export UI_ASSUME_YES=true ;;
    --build) export IMAGES_BUILD=true ;;
    --no-cache) export IMAGES_BUILD=true IMAGES_NO_CACHE=true ;;
    --plain) export UI_PLAIN=true ;;
    -v|--verbose) export UI_VERBOSE=true ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see ./install.sh --help)" >&2; exit 1 ;;
  esac
done
# every step's full output (downloads, builds); start.sh appends to it
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
# shellcheck source=lib/images.sh
source "$ROOT_DIR/lib/images.sh"
# shellcheck source=lib/autostart.sh
source "$ROOT_DIR/lib/autostart.sh"
# shellcheck source=lib/install.sh
source "$ROOT_DIR/lib/install.sh"
load_module_hooks

STEPS=4
ui_banner "outpost" "installer $UI_DOT $(platform_label)"

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

# ------------------------------------------------------------ 2. modules --
ui_step 2 "$STEPS" "Modules"
install_choose_modules
read_lines MODS installed_modules

# ----------------------------------------------------------- 3. settings --
ui_step 3 "$STEPS" "Data and settings"
storage_configure
[[ "${INSTALL_ADVANCED:-}" == true ]] && install_basics
for m in ${MODS[@]+"${MODS[@]}"}; do
  run_hook "$m" configure || [[ $? -eq 127 ]] || exit 1
done

# ------------------------------------------------------------ 4. install --
ui_step 4 "$STEPS" "Download and start"
install_summary
if [[ "${INSTALL_ADVANCED:-}" == true ]] && ! ui_confirm "Install and start outpost now?" y; then
  log_info "Settings saved in .env. Run ./install.sh again to install and start."
  exit 0
fi

if ! get_images core ${MODS[@]+"${MODS[@]}"}; then
  log_error "Nothing was started. Fix the error above (full output in install.log) and re-run ./install.sh."
  exit 1
fi
for m in ${MODS[@]+"${MODS[@]}"}; do
  if declare -F "${m//-/_}_post_build" >/dev/null; then
    ui_run "Setting up $(module_label "$m")" run_hook "$m" post_build || exit 1
  fi
done

ensure_linger
autostart_enable

log_ok "Install complete."
exec "$ROOT_DIR/start.sh"
