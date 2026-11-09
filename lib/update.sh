#!/usr/bin/env bash
# lib/update.sh - helpers for update.sh: the git checkout's state against its
# upstream, and settings a new version added to .env.example.

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

# fetch_upstream - download the new version's commits (not applied yet) and
# set BEHIND / AHEAD (commits on the upstream we don't have, and ours it
# doesn't have).
fetch_upstream() {
  log_info "Checking $UPSTREAM for a new version..."
  if ! git -C "$ROOT_DIR" fetch --quiet; then
    log_error "Could not reach the git remote (no internet?)."
    return 1
  fi
  BEHIND="$(git -C "$ROOT_DIR" rev-list --count "HEAD..$UPSTREAM")"
  AHEAD="$(git -C "$ROOT_DIR" rev-list --count "$UPSTREAM..HEAD")"
}

# version [REF] - short description of a commit: "a1b2c3d (2026-11-09)".
version() {
  git -C "$ROOT_DIR" log -1 --format='%h (%cs)' "${1:-HEAD}"
}

# show_incoming - the commits the update brings, and the modules it touches.
show_incoming() {
  echo
  echo "  Installed: $(version HEAD)"
  echo "  Available: $(version "$UPSTREAM"), $BEHIND new commit(s):"
  git -C "$ROOT_DIR" log --format='    %h %s' "HEAD..$UPSTREAM" | head -n 15
  (( BEHIND > 15 )) && echo "    ..."
  local touched
  touched="$(git -C "$ROOT_DIR" diff --name-only "HEAD" "$UPSTREAM" \
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
