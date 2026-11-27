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

# ---------------------------------------------------------- data folders --
#
# Every module keeps its data in its own *_DIR (compose.yml mounts them,
# .env holds them). install.sh normally asks for ONE folder, OUTPOST_DATA_DIR
# (e.g. the SSD), and puts each *_DIR in it under its default name
# (MAPS_DATA_DIR -> <folder>/maps). --advanced asks for every *_DIR.

# dir_default_name VAR - the folder name from .env.example ("./data/maps" -> "maps").
dir_default_name() {
  local def
  def="$(sed -n "s/^${1}=//p" "$ENV_EXAMPLE" | head -n 1)"
  def="${def:-./data/$(printf '%s' "${1%_DIR}" | tr 'A-Z_' 'a-z-')}"
  basename "$def"
}

# abs_path PATH - PATH made absolute against the checkout (it need not exist).
abs_path() {
  case "$1" in
    /*) printf '%s\n' "${1%/}" ;;
    *) printf '%s\n' "$ROOT_DIR/${1#./}" | sed 's#/\./#/#g; s#/$##' ;;
  esac
}

# guess_data_root VARS... - for an install from before OUTPOST_DATA_DIR: the
# folder every *_DIR is in under its default name (e.g. /mnt/ssd/outpost),
# else ./data.
guess_data_root() {
  local var cur root=""
  for var in "$@"; do
    cur="$(get_env "$var")"
    [[ -z "$cur" ]] && continue
    cur="$(abs_path "$cur")"
    [[ "$(basename "$cur")" == "$(dir_default_name "$var")" ]] || { echo ./data; return; }
    if [[ -z "$root" ]]; then
      root="$(dirname "$cur")"
    elif [[ "$root" != "$(dirname "$cur")" ]]; then
      echo ./data
      return
    fi
  done
  echo "${root:-./data}"
}

# storage_configure - the data folders of everything installed: one question
# (or one per folder with INSTALL_ADVANCED=true), moving existing data.
storage_configure() {
  local old_root new_root var cur expected new
  local -a vars=()
  read_lines vars active_dir_vars

  if [[ "${INSTALL_ADVANCED:-}" == true ]]; then
    for var in ${vars[@]+"${vars[@]}"}; do
      cur="$(get_env "$var")"; cur="${cur:-./data/$(dir_default_name "$var")}"
      new="$(prompt_dir "Folder for $var" "$cur")"
      resync_dir "$cur" "$new" "$var"
      set_env "$var" "$new"
    done
    return 0
  fi

  old_root="$(get_env OUTPOST_DATA_DIR)"
  old_root="$(abs_path "${old_root:-$(guess_data_root ${vars[@]+"${vars[@]}"})}")"
  ui_note "Maps and books can take hundreds of GB: an SSD is a good place, e.g. /mnt/ssd/outpost."
  new_root="$(prompt_dir "Where should outpost keep its data?" "$old_root")"
  set_env OUTPOST_DATA_DIR "$new_root"

  for var in ${vars[@]+"${vars[@]}"}; do
    expected="$old_root/$(dir_default_name "$var")"
    cur="$(get_env "$var")"; cur="$(abs_path "${cur:-$expected}")"
    new="$new_root/$(dir_default_name "$var")"
    if [[ "$cur" != "$expected" && "$cur" != "$(abs_path "./data/$(dir_default_name "$var")")" ]]; then
      # chosen by hand (--advanced or .env): left alone
      ui_note "$var stays at $cur (change it with ./install.sh --advanced)."
      mkdir -p "$cur" 2>/dev/null || true
      continue
    fi
    if ! mkdir -p "$new" 2>/dev/null; then
      log_error "Cannot create '$new'. Is the drive mounted?"
      exit 1
    fi
    resync_dir "$cur" "$new" "$(printf '%s' "${var%_DIR}" | tr 'A-Z_' 'a-z ')"
    set_env "$var" "$new"
    # an empty folder left at the old place (nothing to move)
    [[ "$cur" != "$new" ]] && rmdir "$cur" 2>/dev/null || true
  done
  [[ "$old_root" != "$new_root" ]] && rmdir "$old_root" 2>/dev/null || true
}
