#!/usr/bin/env bash
# lib/common.sh - log helpers, the compose wrapper and .env helpers shared by
# the root scripts. Expects ROOT_DIR (the repo checkout) to be set. Also
# loads lib/platform.sh (Linux/macOS differences) and lib/ui.sh (prompts).

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

# shellcheck source=lib/platform.sh
source "$ROOT_DIR/lib/platform.sh"
# shellcheck source=lib/ui.sh
source "$ROOT_DIR/lib/ui.sh"

PROJECT_NAME="outpost"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

# compose - run the available podman compose backend with the given args on
# the root compose.yml, always as project "outpost" (independent of the
# checkout's directory name). Prefers the built-in `podman compose`
# subcommand, falls back to the standalone `podman-compose` binary.
#
# On macOS always podman-compose (`podman compose` may hand over to Docker
# Compose, which resolves bind mounts like / on the Mac instead of in the
# Podman machine), plus compose.macos.yml for what the remote API lacks.
# images_init - export OUTPOST_REGISTRY and OUTPOST_TAG for compose: the
# images of this commit (sha-<commit>), "-local" with local changes, "local"
# outside a git clone. See lib/images.sh.
images_init() {
  local sha
  OUTPOST_REGISTRY="${OUTPOST_REGISTRY:-$(get_env OUTPOST_REGISTRY)}"
  OUTPOST_REGISTRY="${OUTPOST_REGISTRY:-ghcr.io/faebeee}"
  sha="$(git -C "$ROOT_DIR" rev-parse --short=7 HEAD 2>/dev/null || true)"
  if [[ -z "$sha" ]]; then
    OUTPOST_TAG=local
  elif [[ -n "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no 2>/dev/null)" ]]; then
    # local changes: built here, never mistaken for CI's image of the commit
    OUTPOST_TAG="sha-$sha-local"
  else
    OUTPOST_TAG="sha-$sha"
  fi
  export OUTPOST_REGISTRY OUTPOST_TAG
}

# image_ref SERVICE - the image of a compose service.
image_ref() {
  [[ -n "${OUTPOST_TAG:-}" ]] || images_init
  printf '%s/outpost-%s:%s\n' "$OUTPOST_REGISTRY" "$1" "$OUTPOST_TAG"
}

compose() {
  # core's Settings screen reads .env and resolves relative *_DIRs from here
  export OUTPOST_DIR="$ROOT_DIR"
  # the image names (registry and the checkout's commit)
  [[ -n "${OUTPOST_TAG:-}" ]] || images_init
  local -a args=(-p "$PROJECT_NAME" -f "$ROOT_DIR/compose.yml")
  is_macos && args+=(-f "$ROOT_DIR/compose.macos.yml")
  [[ -f "$ENV_FILE" ]] && args+=(--env-file "$ENV_FILE")
  if is_macos; then
    podman-compose "${args[@]}" "$@"
  elif podman compose version >/dev/null 2>&1; then
    podman compose "${args[@]}" "$@"
  else
    podman-compose "${args[@]}" "$@"
  fi
}


# offer_install LABEL PACKAGE - install a missing requirement with the
# host's package manager after asking, or explain and exit.
offer_install() {
  local label="$1" package="$2" pm
  pm="$(package_manager)"
  if [[ -z "$pm" ]]; then
    log_error "$label is required. Install it (https://podman.io/docs/installation) and re-run ./install.sh"
    is_macos && log_error "With Homebrew (https://brew.sh) the installer can do it for you."
    exit 1
  fi
  if ! ui_confirm "$label is missing. Install it with $pm now?" y; then
    log_error "$label is required. Install it and re-run ./install.sh"
    exit 1
  fi
  if ! ui_run "Installing $label" pkg_install "$package"; then
    log_error "Installing $label failed. Install it yourself and re-run ./install.sh"
    exit 1
  fi
}

# ensure_podman - podman, a compose backend and, on macOS, a running Podman
# machine; offers to install/create what is missing.
ensure_podman() {
  has_cmd podman || offer_install Podman podman
  log_ok "Podman $(podman --version 2>/dev/null | awk '{print $NF}')"

  if is_macos; then
    has_cmd podman-compose || offer_install podman-compose podman-compose
    log_ok "podman-compose $(podman-compose version 2>/dev/null | sed -n 's/^podman-compose version \{0,1\}//p' | head -n 1)"
    ensure_podman_machine
    return
  fi

  if podman compose version >/dev/null 2>&1; then
    log_ok "podman compose"
  elif has_cmd podman-compose; then
    log_ok "podman-compose"
  else
    offer_install podman-compose podman-compose
  fi
}

# ensure_podman_machine - macOS: Podman runs in a Linux VM that must exist
# and run.
ensure_podman_machine() {
  case "$(macos_machine_state)" in
    running) log_ok "Podman machine running" ;;
    stopped)
      ui_run "Starting the Podman machine" podman machine start || exit 1
      ;;
    none)
      ui_note "On macOS, Podman runs its containers in a small Linux VM (the Podman machine)."
      if ! ui_confirm "Create and start the Podman machine now?" y; then
        log_error "outpost needs a Podman machine: podman machine init --now"
        exit 1
      fi
      ui_run "Creating the Podman machine (downloads its image once)" podman machine init --now || exit 1
      ;;
  esac
}

# ensure_linger - lingering starts the user's systemd manager at boot
# (so outpost.service, lib/autostart.sh, can start outpost) and keeps
# podman.socket and the containers running after the user logs out.
ensure_linger() {
  if is_macos; then
    log_info "On macOS outpost does not start on its own: after a restart run ./start.sh."
    return
  fi
  if ! has_cmd loginctl; then
    return
  fi
  if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]]; then
    if loginctl enable-linger "$USER" 2>/dev/null || sudo loginctl enable-linger "$USER"; then
      log_ok "Enabled lingering for $USER"
    else
      log_warn "Run 'sudo loginctl enable-linger $USER' so outpost keeps running after you log out."
    fi
  fi
}

# set_env KEY VALUE - replace (or append) KEY=VALUE in $ENV_FILE. awk instead
# of sed -i (GNU and BSD differ), and any character is fine in VALUE.
set_env() {
  local tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  if KEY="$1" VALUE="$2" awk '
      BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VALUE"] }
      index($0, k "=") == 1 { print k "=" v; done = 1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$ENV_FILE" >"$tmp"; then
    # cat keeps the file's owner and mode
    cat "$tmp" >"$ENV_FILE"
  fi
  rm -f "$tmp"
}

# get_env KEY - value of KEY in .env (read, not sourced), empty if unset.
get_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1
}

# load_env - source .env into the current shell.
load_env() {
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}
