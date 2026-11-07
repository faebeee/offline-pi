#!/usr/bin/env bash
#
# uninstall-hotspot-fallback.sh
#
# Reverses install-hotspot-fallback.sh: disables and removes the systemd
# service and the script. Asks before deleting the config file (it holds
# your Wi-Fi credentials) and before removing the hotspot connection profile.
# The "preferred-wifi" profile is left alone: it is your normal Wi-Fi
# connection, and deleting it could cut this Pi off the network.
#
# Usage: sudo ./uninstall-hotspot-fallback.sh [--purge] [--yes]
#   --purge   also delete the config file and the hotspot profile
#   --yes     don't ask (without --purge config and profile are kept)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BIN_PATH="/usr/local/bin/hotspot-fallback.sh"
ENV_PATH="/etc/hotspot-fallback.env"
SERVICE_PATH="/etc/systemd/system/hotspot-fallback.service"
HOTSPOT_CON_NAME="pi-hotspot"
PREFERRED_CON_NAME="preferred-wifi"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

PURGE=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=true ;;
    -y|--yes) ASSUME_YES=true ;;
    -h|--help) sed -n '3,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) log_error "Unknown option: $arg"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  log_error "Please run this as root (e.g. sudo $0)"
  exit 1
fi

# confirm QUESTION DEFAULT(y|n) - --yes answers the default.
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

if [[ "$ASSUME_YES" != true ]] && ! confirm "Uninstall the hotspot fallback service?" n; then
  log_warn "Cancelled; nothing was changed."
  exit 0
fi

if systemctl list-unit-files hotspot-fallback.service >/dev/null 2>&1; then
  systemctl disable --now hotspot-fallback.service 2>/dev/null || true
  log_ok "Disabled hotspot-fallback.service"
fi
rm -f "$SERVICE_PATH" "$BIN_PATH"
systemctl daemon-reload
log_ok "Removed $SERVICE_PATH and $BIN_PATH"

if command -v nmcli >/dev/null 2>&1 \
  && nmcli -t -f NAME connection show | grep -Fxq "$HOTSPOT_CON_NAME"; then
  active=""
  if nmcli -t -f NAME connection show --active | grep -Fxq "$HOTSPOT_CON_NAME"; then
    active=" (currently ACTIVE: clients on the hotspot will be disconnected)"
  fi
  if [[ "$PURGE" == true ]] || confirm "Delete the '$HOTSPOT_CON_NAME' NetworkManager profile$active?" n; then
    nmcli connection delete "$HOTSPOT_CON_NAME" >/dev/null
    log_ok "Deleted NetworkManager profile '$HOTSPOT_CON_NAME'"
  else
    log_ok "Kept NetworkManager profile '$HOTSPOT_CON_NAME'"
  fi
fi

if [[ -f "$ENV_PATH" ]]; then
  if [[ "$PURGE" == true ]] || confirm "Delete $ENV_PATH (contains your Wi-Fi passwords)?" n; then
    rm -f "$ENV_PATH"
    log_ok "Deleted $ENV_PATH"
  else
    log_ok "Kept $ENV_PATH"
  fi
fi

echo
log_ok "Hotspot fallback uninstalled."
echo "The '$PREFERRED_CON_NAME' Wi-Fi profile was kept so the Pi stays online."
echo "Remove it yourself only if you have another way in:"
echo "  sudo nmcli connection delete $PREFERRED_CON_NAME"
