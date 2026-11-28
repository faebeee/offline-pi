#!/usr/bin/env bash
# lib/modules.sh - the module registry as seen by the shell scripts.
#
# A module is a directory apps/<service>/ with a module.json manifest
# (read by core for the dashboard and the gateway) and a compose service of
# the same name. lib/modules/<service>.sh may define hooks, named with the
# service's dashes turned into underscores:
#
#   <name>_configure    install.sh, every run while installed: prompts,
#                       device checks (the data folders are set before it,
#                       by lib/storage.sh)
#   <name>_post_build   install.sh, once the images are there: one-off setup
#   <name>_manage ARGS  ./manage.sh <service> ARGS
#   <name>_usage        lines for ./manage.sh's help
#
# core is a module too (apps/core), but always installed and running.
#
# Images build with the repo root as context (the npm/Turborepo monorepo),
# so shared workspaces such as packages/ui need no copying before a build.

# manifest_field FILE KEY - a string/number field of a module.json (the
# manifests keep one key per line, so no JSON parser is needed on the host).
manifest_field() {
  sed -n \
    -e "s/^[[:space:]]*\"$2\":[[:space:]]*\"\(.*\)\",\{0,1\}[[:space:]]*$/\1/p" \
    -e "s/^[[:space:]]*\"$2\":[[:space:]]*\([^\",]*\),\{0,1\}[[:space:]]*$/\1/p" \
    "$1" | head -n 1
}

# manifest_list FILE KEY - a one-line string array field, one item per line.
manifest_list() {
  sed -n "s/^[[:space:]]*\"$2\":[[:space:]]*\[\(.*\)\],\{0,1\}[[:space:]]*$/\1/p" "$1" | head -n 1 \
    | tr ',' '\n' | sed 's/[[:space:]"]//g' | sed '/^$/d'
}

# module_dirs SERVICE - the *_DIR variables the module bind-mounts.
module_dirs() {
  manifest_list "$ROOT_DIR/apps/$1/module.json" dirs
}

# all_modules - optional modules (compose service names) by nav order.
all_modules() {
  local f
  for f in "$ROOT_DIR"/apps/*/module.json; do
    [[ "$(manifest_field "$f" optional)" == true ]] || continue
    printf '%s %s\n' "$(manifest_field "$f" num)" "$(manifest_field "$f" service)"
  done | sort -n | awk '{print $2}'
}

# active_dir_vars - every *_DIR in use, once each: those of core and the
# screens it serves itself ("optional": false; Files: FILES_DATA_DIR) and
# of the installed modules.
active_dir_vars() {
  local f m seen=" " var
  {
    for f in "$ROOT_DIR"/apps/*/module.json; do
      if [[ "$(manifest_field "$f" optional)" == false ]]; then manifest_list "$f" dirs; fi
    done
    for m in $(installed_modules); do module_dirs "$m"; done
  } | while read -r var; do
    [[ -z "$var" || "$seen" == *" $var "* ]] && continue
    seen+="$var "
    printf '%s\n' "$var"
  done
}

# module_label SERVICE - human name from its manifest.
module_label() {
  manifest_field "$ROOT_DIR/apps/$1/module.json" label
}

# installed_modules - the MODULES list from .env, one per line, only known ones.
installed_modules() {
  local list m known
  list="$(get_env MODULES)"
  known=" $(all_modules | tr '\n' ' ') "
  for m in ${list//,/ }; do
    [[ "$known" == *" $m "* ]] && printf '%s\n' "$m"
  done
  return 0
}

# retired_modules - modules that no longer exist (merged into another), one
# per line as "SERVICE:REPLACEMENT". start.sh removes their containers and
# images, install.sh says where they went.
retired_modules() {
  # REPLACEMENT "core": now a screen core serves itself, always there
  printf '%s\n' "files:core" "board:core" "supplies:core"
}

# remove_retired_modules - containers and images of retired modules.
remove_retired_modules() {
  local entry m
  has_cmd podman || return 0
  for entry in $(retired_modules); do
    m="${entry%%:*}"
    if podman container exists "outpost-$m" 2>/dev/null; then
      podman rm -f "outpost-$m" >/dev/null && log_ok "Removed outpost-$m (retired module)"
    fi
    for img in $(podman images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null); do
      case "$img" in
        */outpost-"$m":*) podman rmi "$img" >/dev/null 2>&1 && log_ok "Removed image $img (retired module)" ;;
      esac
    done
  done
  return 0
}

# is_module SERVICE - one of the optional modules.
is_module() {
  [[ " $(all_modules | tr '\n' ' ') " == *" $1 "* ]]
}

# is_installed SERVICE - no `installed_modules | grep -q`: with pipefail,
# grep exiting early makes the pipeline fail at random (SIGPIPE).
is_installed() {
  local m
  for m in $(installed_modules); do
    [[ "$m" == "$1" ]] && return 0
  done
  return 1
}

# run_hook SERVICE HOOK [ARGS...] - call the module's hook if it defines one.
# Returns 127 when the hook does not exist.
run_hook() {
  local service="$1" hook="$2" fn
  shift 2
  fn="${service//-/_}_${hook}"
  if declare -F "$fn" >/dev/null; then
    "$fn" "$@"
  else
    return 127
  fi
}

# load_module_hooks - source every lib/modules/*.sh.
load_module_hooks() {
  local f
  for f in "$ROOT_DIR"/lib/modules/*.sh; do
    # shellcheck disable=SC1090
    source "$f"
  done
}


# core_api METHOD PATH [JSON] - call core's API on this Pi as its local
# admin (manage.sh: module start/stop, accounts). Core writes the token to
# CORE_DATA_DIR/cli.token when it starts (only this user can read it) and
# accepts it only on a connection from the machine itself. The request goes
# to curl as a config on stdin, so neither the token nor a password in the
# body ever shows up in `ps`. On macOS curl runs inside the Podman machine,
# where core listens (the Mac's port forward is not a local connection).
# Prints the response body (also on an error); fails when core is
# unreachable or answers an error.
core_api() {
  local method="$1" path="$2" body="${3:-}" port dir token
  port="$(get_env PORT)"
  dir="$(get_env CORE_DATA_DIR)"; dir="${dir:-./data/core}"
  [[ "$dir" == /* ]] || dir="$ROOT_DIR/${dir#./}"
  token="$(cat "$dir/cli.token" 2>/dev/null || true)"
  {
    printf 'url = "http://127.0.0.1:%s%s"\n' "${port:-8080}" "$path"
    printf 'request = "%s"\n' "$method"
    printf 'silent\nshow-error\nfail-with-body\n'
    printf 'header = "X-Pi-Monitor: 1"\n'
    [[ -n "$token" ]] && printf 'header = "Authorization: Bearer %s"\n' "$token"
    if [[ -n "$body" ]]; then
      body="${body//\\/\\\\}"; body="${body//\"/\\\"}"
      printf 'header = "Content-Type: application/json"\n'
      printf 'data-binary = "%s"\n' "$body"
    fi
  } | if is_macos; then
    podman machine ssh -- curl --config -
  elif has_cmd curl; then
    curl --config -
  else
    return 1
  fi
}

# setup_code - the first-run code for creating the admin account in the web
# app, while no account exists (core writes CORE_DATA_DIR/setup.code).
setup_code() {
  local dir
  dir="$(get_env CORE_DATA_DIR)"; dir="${dir:-./data/core}"
  [[ "$dir" == /* ]] || dir="$ROOT_DIR/${dir#./}"
  cat "$dir/setup.code" 2>/dev/null
}

# module_stop / module_start SERVICE - through core, so the dashboard knows
# (and doesn't start it again at the next boot); falls back to compose.
module_stop() {
  core_api POST "/api/modules/$1/stop" >/dev/null 2>&1 || compose stop "$1" >/dev/null 2>&1 || true
}
module_start() {
  core_api POST "/api/modules/$1/start" >/dev/null 2>&1 || compose start "$1" >/dev/null 2>&1
}
