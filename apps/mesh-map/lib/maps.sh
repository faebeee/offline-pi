#!/usr/bin/env bash
# lib/maps.sh - locate apps/maps' data and assets directories, which mesh-map
# mounts read-only. Nothing here creates, moves or writes to them: they belong
# to apps/maps.

MAPS_APP_DIR="$(cd "$SCRIPT_DIR/../maps" 2>/dev/null && pwd || true)"

# maps_env_dir VAR DEFAULT - VAR from apps/maps/.env (read, not sourced),
# relative paths resolved against apps/maps; DEFAULT when unset/not installed.
maps_env_dir() {
  local var="$1" default="$2" value=""
  if [[ -n "$MAPS_APP_DIR" && -f "$MAPS_APP_DIR/.env" ]]; then
    value="$(sed -n "s/^${var}=//p" "$MAPS_APP_DIR/.env" | tail -n 1)"
    value="${value%\"}"; value="${value#\"}"
  fi
  value="${value:-$default}"
  if [[ "$value" != /* && -n "$MAPS_APP_DIR" ]]; then
    value="$MAPS_APP_DIR/${value#./}"
  fi
  printf '%s\n' "$value"
}

# prompt_maps_dir PROMPT CURRENT - ask for an existing, readable directory and
# print its absolute path. Fails (instead of creating it) when it's missing:
# usually apps/maps isn't installed yet or its SSD isn't mounted.
prompt_maps_dir() {
  local prompt_text="$1" current="$2" answer
  read -r -p "$prompt_text [$current]: " answer
  answer="${answer:-$current}"
  if [[ ! -d "$answer" ]]; then
    log_error "'$answer' does not exist. Install apps/maps first (or mount its drive), or enter where its data lives."
    exit 1
  fi
  answer="$(cd "$answer" && pwd)"
  if [[ ! -r "$answer" || ! -x "$answer" ]]; then
    log_error "'$answer' is not readable. Fix permissions and re-run."
    exit 1
  fi
  printf '%s\n' "$answer"
}
