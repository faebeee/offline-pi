#!/usr/bin/env bash
# knowledge - runs inside the container. Downloads the ZIMs listed in
# /etc/knowledge/zims.txt into /data/zim and serves them with kiwix-serve.
#
#   knowledge serve            entrypoint: build library, sync in background, run kiwix-serve
#   knowledge sync [--update]  download missing ZIMs (--update: also newer versions)
#   knowledge prune [--dry-run] delete outdated versions and ZIMs not in zims.txt
#   knowledge library          rebuild /data/library.xml from /data/zim
#   knowledge list             show installed ZIMs and which are served
#
# Layout under /data (= CONTENT_DIR on the host):
#   zim/          complete, verified ZIM files
#   .partial/     in-progress downloads (aria2c, resumable)
#   .cache/       Kiwix catalog cache, lock file
#   library.xml   what kiwix-serve serves; watched with --monitorLibrary
set -euo pipefail

ZIMS_FILE="${ZIMS_FILE:-/etc/knowledge/zims.txt}"
DATA="${DATA:-/data}"
ZIM_DIR="$DATA/zim"
PARTIAL_DIR="$DATA/.partial"
CACHE_DIR="$DATA/.cache"
LIBRARY="$DATA/library.xml"
CATALOG_URL="${CATALOG_URL:-https://library.kiwix.org/catalog/v2/entries?count=100000}"
CATALOG_TTL="${CATALOG_TTL:-86400}"
PORT="${PORT:-8080}"

log_info()  { printf '\033[1;34m[info]\033[0m %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
log_error() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; }
log_ok()    { printf '\033[1;32m\xe2\x9c\x94\033[0m %s\n' "$*"; }

human_size() {
  awk -v b="$1" 'BEGIN { split("B KB MB GB TB", u, " "); i = 1
    while (b >= 1024 && i < 5) { b /= 1024; i++ }; printf "%.1f %s", b, u[i] }'
}

# zim_key FILE - flavour-stable key: strip directory, ".zim" and the date
# suffix ("_2026-10", "_2026-10-22", "_2026-09b").
zim_key() {
  local base="${1##*/}"
  base="${base%.zim}"
  sed -E 's/_[0-9]{4}-[0-9]{2}(-[0-9]{2})?[a-z]?$//' <<< "$base"
}

# wanted_keys - entries from zims.txt (comments and blanks stripped).
wanted_keys() {
  [[ -f "$ZIMS_FILE" ]] || return 0
  sed -e 's/#.*//' -e 's/[[:space:]]//g' "$ZIMS_FILE" | awk 'NF && !seen[$0]++'
}

# latest_local KEY - newest installed file for KEY (empty if none).
latest_local() {
  local key="$1" f best=""
  for f in "$ZIM_DIR"/*.zim; do
    [[ -e "$f" ]] || continue
    [[ "$(zim_key "$f")" == "$key" ]] || continue
    [[ -z "$best" || "${f##*/}" > "${best##*/}" ]] && best="$f"
  done
  printf '%s' "$best"
}

# take_lock - one sync/prune at a time (the startup sync and a manual
# `manage.sh sync` must not download the same file twice).
take_lock() {
  mkdir -p "$CACHE_DIR"
  exec 9>"$CACHE_DIR/sync.lock"
  if ! flock -n 9; then
    log_warn "Another sync/prune is running (see './manage.sh logs'); try again later."
    exit 0
  fi
}

# ------------------------------------------------------------- library --

# build_library - write library.xml with the newest file of every key in
# zim/ and swap it in atomically; kiwix-serve -M picks up the change.
build_library() {
  mkdir -p "$ZIM_DIR"
  local tmp="$LIBRARY.tmp" f key
  local -A newest=()
  for f in "$ZIM_DIR"/*.zim; do
    [[ -e "$f" ]] || continue
    key="$(zim_key "$f")"
    if [[ -z "${newest[$key]:-}" || "${f##*/}" > "${newest[$key]##*/}" ]]; then
      newest[$key]="$f"
    fi
  done
  rm -f "$tmp"
  printf '<library version="20110515"></library>\n' > "$tmp"
  for key in "${!newest[@]}"; do
    if ! kiwix-manage "$tmp" add "${newest[$key]}" >/dev/null 2>&1; then
      log_warn "Skipping unreadable ZIM: ${newest[$key]##*/}"
    fi
  done
  mv -f "$tmp" "$LIBRARY"
}

# ------------------------------------------------------------- catalog --

# catalog_tsv - (messages go to stderr) print "key<TAB>filename<TAB>size<TAB>meta4 url" for every
# catalog entry, newest version of each key first. Uses a cached copy when
# fresh or when the catalog can't be fetched (offline).
catalog_tsv() {
  local xml="$CACHE_DIR/catalog.xml" age=999999999
  mkdir -p "$CACHE_DIR"
  [[ -f "$xml" ]] && age=$(( $(date +%s) - $(stat -c %Y "$xml") ))
  if (( age >= CATALOG_TTL )); then
    log_info "Fetching Kiwix catalog..." >&2
    if curl -fsSL --retry 2 --connect-timeout 15 "$CATALOG_URL" -o "$xml.tmp"; then
      mv -f "$xml.tmp" "$xml"
    else
      rm -f "$xml.tmp"
      if [[ -f "$xml" ]]; then
        log_warn "Catalog fetch failed (offline?); using cached copy." >&2
      else
        log_warn "Catalog fetch failed (offline?) and no cached copy; skipping downloads." >&2
        return 1
      fi
    fi
  fi
  xmlstarlet sel -N a="http://www.w3.org/2005/Atom" -t \
      -m "//a:entry/a:link[@type='application/x-zim']" \
      -v "@length" -o $'\t' -v "@href" -n "$xml" \
    | awk -F'\t' 'NF == 2 && $2 != "" {
        url = $2; f = url; sub(/^.*\//, "", f); sub(/\.meta4$/, "", f)
        key = f; sub(/\.zim$/, "", key)
        sub(/_[0-9][0-9][0-9][0-9]-[0-9][0-9](-[0-9][0-9])?[a-z]?$/, "", key)
        print key "\t" f "\t" $1 "\t" url }' \
    | sort -t$'\t' -k1,1 -k2,2r
}

# free_bytes DIR
free_bytes() { df -Pk "$1" | awk 'NR == 2 { printf "%.0f", $4 * 1024 }'; }

# download URL FILENAME SIZE - aria2c resolves the metalink (mirrors,
# resume, checksum). Lands in .partial/ and only moves into zim/ once
# complete and verified, so kiwix-serve never sees a half-written file.
download() {
  local url="$1" fname="$2" size="$3" need
  mkdir -p "$PARTIAL_DIR" "$ZIM_DIR"
  need=$(( size + size / 20 ))
  if (( $(free_bytes "$DATA") < need )); then
    log_error "Not enough space for $fname: need ~$(human_size "$need"), $(human_size "$(free_bytes "$DATA")") free. Skipping."
    return 1
  fi
  log_info "Downloading $fname ($(human_size "$size"))..."
  if ! aria2c --dir="$PARTIAL_DIR" --continue=true --check-integrity=true \
      --max-connection-per-server=4 --split=4 --file-allocation=none \
      --summary-interval=30 --console-log-level=warn \
      --show-console-readout="$([[ -t 1 ]] && echo true || echo false)" \
      --follow-metalink=mem "$url"; then
    log_error "Download of $fname failed; it resumes on the next sync."
    return 1
  fi
  mv -f "$PARTIAL_DIR/$fname" "$ZIM_DIR/$fname"
  log_ok "Installed $fname"
}

cmd_sync() {
  local update=false
  [[ "${1:-}" == "--update" ]] && update=true
  take_lock
  mkdir -p "$ZIM_DIR"

  local -a keys
  mapfile -t keys < <(wanted_keys)
  if (( ${#keys[@]} == 0 )); then
    log_warn "No entries in zims.txt; nothing to download."
    return 0
  fi

  # Nothing missing and no update requested: don't touch the network.
  local key missing=0
  for key in "${keys[@]}"; do
    [[ -n "$(latest_local "$key")" ]] || missing=$(( missing + 1 ))
  done
  if (( missing == 0 )) && [[ "$update" != true ]]; then
    log_ok "All ${#keys[@]} ZIM(s) from zims.txt are installed."
    return 0
  fi

  local catalog
  catalog="$(catalog_tsv)" || return 0

  local failed=0 row fname size url have
  for key in "${keys[@]}"; do
    have="$(latest_local "$key")"
    if [[ -n "$have" && "$update" != true ]]; then
      continue
    fi
    row="$(awk -F'\t' -v k="$key" '$1 == k { print; exit }' <<< "$catalog")"
    if [[ -z "$row" ]]; then
      log_warn "'$key' is not in the Kiwix catalog; check the name in zims.txt."
      failed=$(( failed + 1 ))
      continue
    fi
    IFS=$'\t' read -r _ fname size url <<< "$row"
    if [[ -n "$have" && ! "$fname" > "${have##*/}" ]]; then
      log_ok "Up to date: ${have##*/}"
      continue
    fi
    if download "$url" "$fname" "$size"; then
      build_library
    else
      failed=$(( failed + 1 ))
    fi
  done

  if (( failed > 0 )); then
    log_warn "Sync finished with $failed problem(s)."
  else
    log_ok "Sync complete."
  fi
}

# cmd_prune [--dry-run] - delete files kiwix-serve no longer serves: older
# versions of a key, and keys that were removed from zims.txt. Also drops
# leftover partial downloads of keys no longer wanted.
cmd_prune() {
  local dry=false
  [[ "${1:-}" == "--dry-run" ]] && dry=true
  [[ "$dry" == true ]] || take_lock

  local -A wanted=()
  local key f
  while read -r key; do wanted[$key]=1; done < <(wanted_keys)

  local -a victims=()
  for f in "$ZIM_DIR"/*.zim "$PARTIAL_DIR"/*; do
    [[ -e "$f" ]] || continue
    key="$(zim_key "${f%.aria2}")"
    if [[ -z "${wanted[$key]:-}" ]]; then
      victims+=("$f")
    elif [[ "$f" == "$ZIM_DIR"/* && "$f" != "$(latest_local "$key")" ]]; then
      victims+=("$f")
    fi
  done

  if (( ${#victims[@]} == 0 )); then
    [[ "$dry" == true ]] || log_ok "Nothing to prune."
    return 0
  fi
  if [[ "$dry" == true ]]; then
    for f in "${victims[@]}"; do
      printf '%s\t%s\n' "$(du -sh "$f" | cut -f1)" "${f#"$DATA"/}"
    done
    return 0
  fi
  for f in "${victims[@]}"; do
    rm -f "$f" && log_ok "Deleted ${f#"$DATA"/}"
  done
  build_library
}

cmd_list() {
  local f served
  if ! compgen -G "$ZIM_DIR/*.zim" >/dev/null; then
    log_warn "No ZIM files installed yet."
  else
    printf '%-55s %10s  %s\n' "FILE" "SIZE" "STATUS"
    for f in "$ZIM_DIR"/*.zim; do
      served="old version"
      [[ "$f" == "$(latest_local "$(zim_key "$f")")" ]] && served="served"
      grep -qxF "$(zim_key "$f")" <(wanted_keys) || served="$served, not in zims.txt"
      printf '%-55s %10s  %s\n' "${f##*/}" "$(human_size "$(stat -c %s "$f")")" "$served"
    done
  fi
  local key missing=()
  while read -r key; do
    [[ -n "$(latest_local "$key")" ]] || missing+=("$key")
  done < <(wanted_keys)
  if (( ${#missing[@]} > 0 )); then
    echo
    log_info "Not downloaded yet: ${missing[*]}"
  fi
}

cmd_serve() {
  mkdir -p "$ZIM_DIR" "$PARTIAL_DIR" "$CACHE_DIR"
  build_library
  if [[ "${AUTO_SYNC:-true}" == true ]]; then
    # Background: content shows up in kiwix-serve as each download finishes.
    ( cmd_sync || log_error "Startup sync failed; run './manage.sh sync' to retry." ) &
  fi
  exec kiwix-serve --library --monitorLibrary --port="$PORT" \
    --address="${BIND_ADDRESS:-all}" "$LIBRARY"
}

case "${1:-}" in
  serve)   cmd_serve ;;
  sync)    shift; cmd_sync "$@" ;;
  prune)   shift; cmd_prune "$@" ;;
  library) build_library; log_ok "Library rebuilt." ;;
  list)    cmd_list ;;
  *) echo "Usage: knowledge serve|sync [--update]|prune [--dry-run]|library|list" >&2; exit 1 ;;
esac
