#!/usr/bin/env bash
# lib/storage.sh - prompt for and relocate the persistent data directory.

# prompt_dir PROMPT CURRENT - ask for a directory, create it and print its
# absolute path. Fails if it cannot be created or written (e.g. the SSD is not
# mounted).
prompt_dir() {
  local prompt_text="$1" current="$2" answer
  read -r -p "$prompt_text [$current]: " answer
  answer="${answer:-$current}"
  if ! mkdir -p "$answer" 2>/dev/null; then
    log_error "Cannot create '$answer'. Is the drive mounted?"
    exit 1
  fi
  answer="$(cd "$answer" && pwd)"
  if [[ ! -w "$answer" ]]; then
    log_error "'$answer' is not writable. Fix permissions/mount it and re-run."
    exit 1
  fi
  printf '%s\n' "$answer"
}

# resync_dir OLD NEW LABEL - when the location changed and OLD has content,
# confirm and move it to NEW (copy, then remove the source). Aborts without
# touching .env if the copy fails, so no data is lost.
resync_dir() {
  local old="$1" new="$2" label="$3"
  if [[ -z "$old" ]]; then
    return
  fi
  if [[ -d "$old" ]]; then
    old="$(cd "$old" && pwd)"
  fi
  if [[ "$old" == "$new" ]] || [[ ! -d "$old" ]] || [[ -z "$(ls -A "$old" 2>/dev/null)" ]]; then
    return
  fi

  log_warn "$label location changed: $old -> $new"
  local reply
  read -r -p "Move existing contents of '$old' to '$new' now? [Y/n]: " reply
  reply="${reply:-Y}"
  if [[ ! "$reply" =~ ^[Yy] ]]; then
    log_warn "Skipped moving $label; it stays at '$old' until you move it yourself."
    return
  fi

  log_info "Moving $label from '$old' to '$new'..."
  # no perms/owner/group: exFAT (common on external SSDs) rejects chmod/chown
  if has_cmd rsync; then
    if ! rsync -a --no-perms --no-owner --no-group "$old"/ "$new"/; then
      log_error "Failed to copy $label to '$new'. Both copies were kept and .env is unchanged; fix the issue and re-run ./install.sh."
      exit 1
    fi
  elif ! cp -r "$old"/. "$new"/; then
    log_error "Failed to copy $label to '$new'. Both copies were kept and .env is unchanged; fix the issue and re-run ./install.sh."
    exit 1
  fi
  rm -rf "$old"
  log_ok "$label moved to '$new'"
}
