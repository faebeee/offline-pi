#!/usr/bin/env bash
# lib/platform.sh - what differs between a Raspberry Pi / Linux host and a
# Mac (development), and Bash 3.2 stand-ins (macOS ships Bash 3.2: no
# mapfile, no associative arrays, BSD sed/stat).
#
# On macOS Podman runs in a VM ("podman machine"). Bind mounts work for paths
# the machine shares (by default /Users, /private, /var/folders), the
# containers' host network is the VM's, so start.sh forwards PORT from the Mac
# into the VM (macos_expose_port), and USB devices can't be passed through
# (mesh then needs a node reachable over the network).

OS_NAME="$(uname -s)"

is_macos() { [[ "$OS_NAME" == Darwin ]]; }

# is_pi - running on a Raspberry Pi.
is_pi() {
  grep -qi 'raspberry' /proc/device-tree/model 2>/dev/null
}

# platform_label - one line describing this host.
platform_label() {
  local model
  if is_macos; then
    printf 'macOS %s (%s)\n' "$(sw_vers -productVersion 2>/dev/null)" "$(uname -m)"
  elif is_pi; then
    model="$(tr -d '\0' </proc/device-tree/model 2>/dev/null)"
    printf '%s\n' "${model:-Raspberry Pi}"
  else
    model="$(sed -n 's/^PRETTY_NAME="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/os-release 2>/dev/null)"
    printf '%s (%s)\n' "${model:-Linux}" "$(uname -m)"
  fi
}

# read_lines NAME COMMAND [ARGS...] - the output lines of COMMAND into the
# array NAME (mapfile -t NAME < <(COMMAND), which Bash 3.2 lacks).
read_lines() {
  local __name="$1" __line
  shift
  eval "$__name=()"
  while IFS= read -r __line; do
    eval "$__name+=(\"\$__line\")"
  done < <("$@")
}

# file_group FILE - the group owning FILE (GNU or BSD stat).
file_group() {
  stat -c %G "$1" 2>/dev/null || stat -f %Sg "$1"
}

# free_space DIR - free space on DIR's filesystem, human readable ("120G").
free_space() {
  df -Ph "$1" 2>/dev/null | awk 'NR == 2 { print $4 }'
}

# lan_ip - this host's address on the local network (empty if none).
lan_ip() {
  local ip=""
  if is_macos; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
  else
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  printf '%s\n' "$ip"
}

# package_manager - the host's package manager we know how to drive.
package_manager() {
  if is_macos; then
    has_cmd brew && echo brew
  elif has_cmd apt-get; then
    echo apt
  elif has_cmd dnf; then
    echo dnf
  fi
  return 0
}

# pkg_install PACKAGES... - install with the host's package manager.
pkg_install() {
  case "$(package_manager)" in
    brew) brew install "$@" ;;
    apt)  sudo apt-get update -qq && sudo apt-get install -y "$@" ;;
    dnf)  sudo dnf install -y "$@" ;;
    *)    return 1 ;;
  esac
}

# ------------------------------------------------------------------ macOS --

# macos_shared_path DIR - whether the Podman machine can see DIR (only the
# directories it mounts, by default /Users, /private and /var/folders).
macos_shared_path() {
  case "$1" in
    /Users/*|/private/*|/var/folders/*|/tmp/*) return 0 ;;
    *) return 1 ;;
  esac
}

# macos_machine_state - "running", "stopped" or "none" (no machine yet).
macos_machine_state() {
  local names state
  names="$(podman machine list --format '{{.Name}}' 2>/dev/null || true)"
  if [[ -z "$names" ]]; then
    echo none
    return
  fi
  state="$(podman machine inspect --format '{{.State}}' 2>/dev/null | head -n 1)"
  [[ "$state" == running ]] && echo running || echo stopped
}

# macos_expose_port PORT BIND_ADDRESS - forward PORT on the Mac to the same
# port in the Podman machine (the containers' host network), through
# gvproxy's forwarder API, reachable from inside the VM. Not persistent:
# start.sh calls it every time.
macos_expose_port() {
  local port="$1" bind="$2" local_addr
  local_addr=":$port"
  [[ "$bind" == 127.0.0.1 ]] && local_addr="127.0.0.1:$port"
  # 192.168.127.1: gvproxy's gateway; 192.168.127.2: the VM itself
  podman machine ssh "curl -fsS -X POST http://192.168.127.1/services/forwarder/unexpose -d '{\"local\":\"$local_addr\",\"protocol\":\"tcp\"}' >/dev/null 2>&1; curl -fsS -X POST http://192.168.127.1/services/forwarder/expose -d '{\"local\":\"$local_addr\",\"remote\":\"192.168.127.2:$port\",\"protocol\":\"tcp\"}'" >/dev/null 2>&1
}
