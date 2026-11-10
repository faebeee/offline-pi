#!/usr/bin/env bash
# lib/modules.sh - the module registry as seen by the shell scripts.
#
# A module is a directory apps/<service>/ with a module.json manifest
# (read by core for the dashboard and the gateway) and a compose service of
# the same name. lib/modules/<service>.sh may define hooks, named with the
# service's dashes turned into underscores:
#
#   <name>_configure    install.sh, every run while installed: prompts,
#                       storage dirs (set_env), device checks
#   <name>_prepare      install.sh and start.sh, before building: files the
#                       build needs that are not in the checkout
#   <name>_post_build   install.sh, after building: one-off setup runs
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

# prepare_builds SERVICES... - run each <name>_prepare hook (core included).
prepare_builds() {
  local m
  for m in "$@"; do
    run_hook "$m" prepare || [[ $? -eq 127 ]] || exit 1
  done
}

# core_api METHOD PATH - call core's API on this Pi (module start/stop from
# manage.sh). Prints the response body; fails when core is unreachable.
core_api() {
  local method="$1" path="$2" port pin
  port="$(get_env PORT)"
  pin="$(get_env CONTROL_PIN)"
  if ! has_cmd curl; then
    return 1
  fi
  curl -fsS -X "$method" -H 'X-Pi-Monitor: 1' ${pin:+-H "X-Control-Pin: $pin"} \
    "http://127.0.0.1:${port:-8080}${path}"
}

# module_stop / module_start SERVICE - through core, so the dashboard knows
# (and doesn't start it again at the next boot); falls back to compose.
module_stop() {
  core_api POST "/api/modules/$1/stop" >/dev/null 2>&1 || compose stop "$1" >/dev/null 2>&1 || true
}
module_start() {
  core_api POST "/api/modules/$1/start" >/dev/null 2>&1 || compose start "$1" >/dev/null 2>&1
}
