#!/usr/bin/env bash
# lib/images.sh - get the container images: download the ones CI built for
# this exact commit (.github/workflows/images.yml), or build them here.
#
# compose.yml names every image $OUTPOST_REGISTRY/outpost-<service>:$OUTPOST_TAG
# (images_init in lib/common.sh): OUTPOST_TAG is sha-<commit> of the
# checkout, so code and images always match. Building locally (10-30 minutes on a Pi) happens only when
#   - asked for (--build, or OUTPOST_BUILD=true in .env),
#   - the checkout has local changes to tracked files or is not a git clone,
#   - or the registry has no image for this commit (a fork, an unpushed
#     commit, CI still running): then each missing image is built.

# images_local_reason - why images must be built here; empty = they can be pulled.
images_local_reason() {
  if [[ "${IMAGES_BUILD:-}" == true || "$(get_env OUTPOST_BUILD)" == true ]]; then
    echo "building was asked for"
  elif [[ "$OUTPOST_TAG" == local ]]; then
    echo "this folder is not a git clone"
  elif [[ "$OUTPOST_TAG" == *-local ]]; then
    echo "the checkout has local changes"
  fi
}

# get_images LOG_LABEL SERVICES... - make every service's image available:
# already here, downloaded, or built. Returns non-zero when one is missing.
get_images() {
  local reason s ref
  local -a build=()
  [[ -n "${OUTPOST_TAG:-}" ]] || images_init
  reason="$(images_local_reason)"
  for s in "$@"; do
    ref="$(image_ref "$s")"
    if [[ -n "$reason" ]]; then
      build+=("$s")
    elif podman image exists "$ref" 2>/dev/null; then
      continue
    elif podman manifest inspect "$ref" >/dev/null 2>&1; then
      # published: download it, with progress
      ui_run "Downloading $(service_label "$s")" podman pull "$ref" || build+=("$s")
    elif podman pull -q "$ref" >>"${UI_LOG:-/dev/null}" 2>&1; then
      # an older Podman that can't inspect a remote image
      log_ok "Downloaded $(service_label "$s")"
    else
      log_info "No ready-made $(service_label "$s") image for this version yet; building it here."
      build+=("$s")
    fi
  done
  [[ ${#build[@]} -eq 0 ]] && return 0
  [[ -n "$reason" ]] && log_info "Building the images here: $reason."
  is_pi && ui_note "Building takes a while on a Pi (10-30 minutes the first time); later builds reuse the cache."
  for s in "${build[@]}"; do
    if ! ui_run "Building $(service_label "$s")" compose build "$s" $([[ "${IMAGES_NO_CACHE:-}" == true ]] && echo --no-cache); then
      log_error "Building $(service_label "$s") failed (see the log)."
      return 1
    fi
  done
}

# service_label SERVICE - "Core" for core, else the module label.
service_label() {
  if [[ "$1" == core ]]; then echo "Core"; else module_label "$1"; fi
}

# remove_old_images - images of earlier versions (other tags, the old local
# names), to free the disk. Images still used by a container stay.
remove_old_images() {
  local s img
  for s in core $(all_modules); do
    for img in $(podman images --format '{{.Repository}}:{{.Tag}}' "$OUTPOST_REGISTRY/outpost-$s" 2>/dev/null); do
      [[ "$img" == "$(image_ref "$s")" ]] && continue
      podman rmi "$img" >/dev/null 2>&1 || true
    done
  done
  # built locally before images were published (localhost/outpost-*:latest)
  for img in $(podman images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null); do
    case "$img" in
      localhost/outpost-*) podman rmi "$img" >/dev/null 2>&1 || true ;;
    esac
  done
  podman image prune -f >/dev/null 2>&1 || true
}
