#!/usr/bin/env bash
# get.sh - install outpost with one command:
#
#   curl -fsSL https://raw.githubusercontent.com/faebeee/offline-pi/main/get.sh | bash
#
# Installs git if it is missing, clones outpost to ~/outpost (OUTPOST_HOME)
# and runs ./install.sh there; arguments are passed on, e.g.
#   curl -fsSL .../get.sh | bash -s -- --advanced
# Run again to re-run the installer of an existing clone.
set -euo pipefail

# everything in a function: a cut-off download runs nothing
main() {
  local home="${OUTPOST_HOME:-$HOME/outpost}"
  local repo="${OUTPOST_REPO:-https://github.com/faebeee/offline-pi.git}"

  if [[ "$(id -u)" -eq 0 ]]; then
    echo "Run this as your normal user, not as root: outpost uses rootless Podman and asks for sudo only when it needs it." >&2
    exit 1
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "Installing git..."
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get update -qq && sudo apt-get install -y -qq git
    elif command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y -q git
    elif command -v brew >/dev/null 2>&1; then
      brew install git
    else
      echo "Please install git, then run this again." >&2
      exit 1
    fi
  fi

  if [[ -d "$home/.git" ]]; then
    echo "outpost is already in $home: running its installer again."
  elif [[ -e "$home" ]]; then
    echo "$home exists and is not an outpost clone. Set OUTPOST_HOME to another folder." >&2
    exit 1
  else
    echo "Downloading outpost to $home..."
    git clone --quiet "$repo" "$home"
  fi

  cd "$home"
  # piped into bash, stdin is this script: give the installer the terminal
  if (exec </dev/tty) 2>/dev/null; then
    exec ./install.sh "$@" </dev/tty
  fi
  exec ./install.sh "$@"
}

main "$@"
