#!/usr/bin/env bash
# lib/storage.sh - prompt for and relocate the persistent data directory.

# dir_usable DIR - create DIR if needed and check it is writable; prints
# why not (ui_input validator).
dir_usable() {
  if [[ -z "$1" ]]; then
    echo "Enter a directory."
    return 1
  fi
  if ! mkdir -p "$1" 2>/dev/null; then
    echo "Cannot create '$1'. Is the drive mounted?"
    return 1
  fi
  if [[ ! -w "$1" ]]; then
    echo "'$1' is not writable. Fix permissions or mount it, or choose another."
    return 1
  fi
}

# prompt_dir PROMPT CURRENT - ask for a directory, create it and print its
# absolute path. Asks again while it cannot be created or written (e.g. the
# SSD is not mounted); fails when answering without asking (--yes).
prompt_dir() {
  local prompt_text="$1" current="$2" answer err free
  ui_input "$prompt_text" "$current" dir_usable
  answer="$UI_REPLY"
  if ! err="$(dir_usable "$answer")"; then
    log_error "$err"
    exit 1
  fi
  answer="$(cd "$answer" && pwd)"
  free="$(free_space "$answer")"
  [[ -n "$free" ]] && ui_note "$free free there"
  if is_macos && ! macos_shared_path "$answer"; then
    log_warn "The Podman machine can't see '$answer' (it shares /Users by default); containers would get an empty directory." >&2
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
  if ! ui_confirm "Move the $label ($(du -sh "$old" 2>/dev/null | cut -f1)) from '$old' to '$new' now?" y; then
    log_warn "Skipped moving $label; it stays at '$old' until you move it yourself."
    return
  fi

  if ! ui_run "Copying $label to '$new'" copy_dir "$old" "$new"; then
    log_error "Failed to copy $label to '$new'. Both copies were kept and .env is unchanged; fix the issue and re-run ./install.sh."
    exit 1
  fi
  rm -rf "$old"
  log_ok "$label moved to '$new'"
}

# copy_dir FROM TO - copy FROM's contents into TO. No perms/owner/group:
# exFAT (common on external SSDs) rejects chmod/chown.
copy_dir() {
  if has_cmd rsync; then
    rsync -a --no-perms --no-owner --no-group "$1"/ "$2"/
  else
    cp -r "$1"/. "$2"/
  fi
}
