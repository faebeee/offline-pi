#!/usr/bin/env bash
# lib/update.sh - helpers for update.sh: the git checkout's state against
# the newest release (tag v<version>; update.sh installs releases only), and
# settings a new version added to .env.example.

# require_git_checkout - the checkout must be a git clone on a branch with an
# upstream and without local changes to tracked files (they would block or be
# mixed into the update). Sets UPSTREAM (e.g. origin/main).
require_git_checkout() {
  if ! has_cmd git; then
    log_error "git is required to update (sudo apt install git)."
    return 1
  fi
  if ! git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_error "$ROOT_DIR is not a git clone: update by cloning it again (see README)."
    return 1
  fi
  if ! git -C "$ROOT_DIR" symbolic-ref -q HEAD >/dev/null; then
    log_error "The checkout is not on a branch (detached HEAD): run 'git checkout main' first."
    return 1
  fi
  if ! UPSTREAM="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    log_error "Branch '$(git -C "$ROOT_DIR" branch --show-current)' has no upstream: run 'git branch -u origin/main'."
    return 1
  fi
  local changes
  changes="$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no)"
  if [[ -n "$changes" ]]; then
    log_error "These files have local changes; commit, stash ('git stash') or undo them first:"
    printf '%s\n' "$changes" >&2
    return 1
  fi
}

# latest_release - the newest release tag (v<version>, highest version
# first, pre-releases such as v0.3.0-rc.1 skipped); empty when none exists.
latest_release() {
  local tags
  tags="$(git -C "$ROOT_DIR" tag -l 'v[0-9]*' --sort=-v:refname)"
  awk '!/-/ { print; exit }' <<<"$tags"
}

# fetch_upstream - download the new commits and tags (not applied yet) and
# set TARGET (the newest release tag, empty without one) and BEHIND / AHEAD
# (commits of the release we don't have, and ours it doesn't have).
fetch_upstream() {
  log_info "Checking for a new release..."
  if ! git -C "$ROOT_DIR" fetch --quiet --tags; then
    log_error "Could not reach the git remote (no internet?)."
    return 1
  fi
  TARGET="$(latest_release)"
  BEHIND=0 AHEAD=0
  [[ -n "$TARGET" ]] || return 0
  BEHIND="$(git -C "$ROOT_DIR" rev-list --count "HEAD..$TARGET")"
  AHEAD="$(git -C "$ROOT_DIR" rev-list --count "$TARGET..HEAD")"
}

# app_version [REF] - the app's version at a commit (root package.json),
# empty for commits from before versioning.
app_version() {
  { git -C "$ROOT_DIR" show "${1:-HEAD}:package.json" 2>/dev/null || true; } \
    | sed -n 's/^  "version": *"\([^"]*\)".*/\1/p'
}

# version [REF] - short description of a commit: "0.1.0 (a1b2c3d, 2026-11-09)",
# or "a1b2c3d (2026-11-09)" before versioning.
version() {
  local ref="${1:-HEAD}" v
  v="$(app_version "$ref")"
  if [[ -n "$v" ]]; then
    git -C "$ROOT_DIR" log -1 --format="$v (%h, %cs)" "$ref"
  else
    git -C "$ROOT_DIR" log -1 --format='%h (%cs)' "$ref"
  fi
}

# show_incoming - the commits the update to TARGET brings, and the modules it
# touches.
show_incoming() {
  local log
  echo
  echo "  Installed: $(version HEAD)"
  echo "  Available: $(version "$TARGET"), $BEHIND new commit(s):"
  log="$(git -C "$ROOT_DIR" log --format='    %h %s' "HEAD..$TARGET")"
  printf '%s\n' "$log" | sed -n '1,15p'
  (( BEHIND > 15 )) && echo "    ..."
  local touched
  touched="$(git -C "$ROOT_DIR" diff --name-only "HEAD" "$TARGET" \
    | awk -F/ '$1 == "apps" || $1 == "packages" { print $2; next } { print "scripts/config" }' \
    | sort -u | paste -sd ' ' -)"
  [[ -n "$touched" ]] && echo "  Changes in: $touched"
  echo
}

# new_env_settings OLD_REF - settings this version added to .env.example
# since OLD_REF that .env doesn't set, as "KEY=default" lines. They need no
# action: compose.yml falls back to the same default for every unset key.
new_env_settings() {
  local old="$1" line key
  while IFS= read -r line; do
    key="${line%%=*}"
    git -C "$ROOT_DIR" show "$old:.env.example" 2>/dev/null | grep -q "^${key}=" && continue
    grep -q "^${key}=" "$ENV_FILE" && continue
    printf '%s\n' "$line"
  done < <(grep -E '^[A-Z][A-Z0-9_]*=' "$ENV_EXAMPLE")
}
