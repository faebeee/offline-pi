#!/usr/bin/env bash
# knowledge - runs inside the container. Downloads the ZIMs the user
# selected (in the web app's Library screen, stored in /data/selection.txt)
# into /data/zim and serves them with kiwix-serve. Nothing is downloaded
# until something is selected.
#
#   knowledge serve             entrypoint: build library, resume the sync, run kiwix-serve
#   knowledge apply KEY...      new selection: stop a running sync, delete
#                               deselected ZIMs, sync the rest in the background
#   knowledge sync [--update]   download missing ZIMs (--update: also newer versions)
#   knowledge sync-bg [--update] the same, detached (output in the container log)
#   knowledge prune [--dry-run] delete outdated versions and unselected ZIMs
#   knowledge library           rebuild /data/library.xml from /data/zim
#   knowledge list              show installed ZIMs and which are served
#
# Core's library domain runs apply/sync-bg through podman exec.
#
# Layout under /data (= CONTENT_DIR on the host):
#   selection.txt the selected keys, one per line (written by `apply` only)
#   zim/          complete, verified ZIM files
#   .partial/     in-progress downloads (aria2c, resumable)
#   .cache/       Kiwix catalog cache, lock file, sync.json (sync status),
#                 sync.pid (the running sync, so `apply` can stop it)
#   library.xml   what kiwix-serve serves; watched with --monitorLibrary
set -euo pipefail

DATA="${DATA:-/data}"
SELECTION="$DATA/selection.txt"
ZIM_DIR="$DATA/zim"
PARTIAL_DIR="$DATA/.partial"
CACHE_DIR="$DATA/.cache"
LIBRARY="$DATA/library.xml"
# what the sync is doing, for core's library domain (GET /api/library/sync),
# which reads it through its read-only host mount
STATUS_FILE="$CACHE_DIR/sync.json"
PID_FILE="$CACHE_DIR/sync.pid"
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

# valid_key KEY - a Kiwix file name without date and ".zim"
valid_key() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; }

# wanted_keys - the selection (comments and blanks stripped).
wanted_keys() {
  [[ -f "$SELECTION" ]] || return 0
  sed -e 's/#.*//' -e 's/[[:space:]]//g' "$SELECTION" | awk 'NF && !seen[$0]++'
}

# installed_keys - keys of every ZIM in zim/
installed_keys() {
  local f
  for f in "$ZIM_DIR"/*.zim; do
    [[ -e "$f" ]] && zim_key "$f"
  done | awk '!seen[$0]++'
}

# write_selection KEY... - atomically
write_selection() {
  local tmp="$SELECTION.tmp"
  {
    echo "# Selected in the Library screen of the web app; one Kiwix name per line."
    if (( $# > 0 )); then printf '%s\n' "$@"; fi
  } > "$tmp"
  mv -f "$tmp" "$SELECTION"
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

# ---------------------------------------------------------- sync status --

SYNC_STARTED=0
SYNC_ACTIVE=false

json_str() {
  local v="${1//\\/\\\\}"
  v="${v//\"/\\\"}"
  printf '"%s"' "$v"
}

# write_status STATE PHASE [FILE SIZE INDEX COUNT FAILED RESULT MESSAGE]
#   STATE  running | idle
#   PHASE  checking | catalog | downloading | "" (idle)
#   RESULT ok | problems | interrupted | "" (running)
# Written atomically (tmp + mv), so a reader never sees half a file.
write_status() {
  local state="$1" phase="$2" file="${3:-}" size="${4:-0}" index="${5:-0}" count="${6:-0}"
  local failed="${7:-0}" result="${8:-}" message="${9:-}" now
  now="$(date +%s)"
  mkdir -p "$CACHE_DIR"
  {
    printf '{"state":%s,"phase":%s,' "$(json_str "$state")" "$(json_str "$phase")"
    printf '"file":%s,"size":%s,"index":%s,"count":%s,"failed":%s,' \
      "$(json_str "$file")" "${size:-0}" "${index:-0}" "${count:-0}" "${failed:-0}"
    printf '"result":%s,"message":%s,' "$(json_str "$result")" "$(json_str "$message")"
    printf '"startedAt":%s,"updatedAt":%s}\n' "$SYNC_STARTED" "$now"
  } > "$STATUS_FILE.tmp" && mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
}

# a sync that dies half-way (error, container stop) says so
sync_exit() {
  if [[ "$SYNC_ACTIVE" == true ]]; then
    write_status idle "" "" 0 0 0 0 interrupted "The sync stopped before it finished; it resumes on the next start."
  fi
}

# take_lock [SECONDS] - one sync/prune at a time (the startup sync and a
# manual `manage.sh knowledge sync` must not download the same file twice).
# Without SECONDS it gives up at once (exit 0: someone else is on it); with
# SECONDS it waits that long and fails (exit 1). BusyBox flock has no -w.
take_lock() {
  mkdir -p "$CACHE_DIR"
  exec 9>"$CACHE_DIR/sync.lock"
  local wait="${1:-0}" i
  for (( i = 0; ; i++ )); do
    flock -n 9 && return 0
    (( i < wait )) || break
    sleep 1
  done
  if (( wait > 0 )); then
    log_error "Another sync/prune is still running after ${wait}s; try again."
    exit 1
  fi
  log_warn "Another sync/prune is running (see './manage.sh logs knowledge'); try again later."
  exit 0
}

release_lock() { exec 9>&-; }

# stop_sync - stop a running sync (and its aria2c); the partial download
# stays and resumes on the next sync.
stop_sync() {
  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  log_info "Stopping the running sync..."
  # sync-bg runs it as a process group leader; a manual sync isn't one
  kill -TERM -- "-$pid" 2>/dev/null || { pkill -TERM -P "$pid" 2>/dev/null || true; kill -TERM "$pid" 2>/dev/null || true; }
}

# container_log - where a detached sync writes: the container's own output
# (PID 1's stdout), so `./manage.sh logs knowledge` and the Logs screen show it
container_log() {
  if [[ -w /proc/1/fd/1 ]]; then echo /proc/1/fd/1; else echo /dev/null; fi
}

# start_sync_bg [--update] - run `sync` detached in its own process group
start_sync_bg() {
  local out
  out="$(container_log)"
  if command -v setsid >/dev/null; then
    setsid "$0" sync "$@" </dev/null >>"$out" 2>&1 &
  else
    "$0" sync "$@" </dev/null >>"$out" 2>&1 &
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
  # BASHPID, not $$: the startup sync is a subshell of the entrypoint
  echo "$BASHPID" > "$PID_FILE"
  SYNC_STARTED="$(date +%s)"
  SYNC_ACTIVE=true
  trap 'sync_exit; rm -f "$PID_FILE"' EXIT
  trap 'exit 143' TERM INT
  write_status running checking

  local -a keys
  mapfile -t keys < <(wanted_keys)
  if (( ${#keys[@]} == 0 )); then
    log_info "No books selected; nothing to download."
    SYNC_ACTIVE=false
    write_status idle "" "" 0 0 0 0 ok "No books selected."
    return 0
  fi

  # Nothing missing and no update requested: don't touch the network.
  local key missing=0
  for key in "${keys[@]}"; do
    [[ -n "$(latest_local "$key")" ]] || missing=$(( missing + 1 ))
  done
  if (( missing == 0 )) && [[ "$update" != true ]]; then
    log_ok "All ${#keys[@]} selected ZIM(s) are installed."
    SYNC_ACTIVE=false
    write_status idle "" "" 0 0 "${#keys[@]}" 0 ok "All ${#keys[@]} books are installed."
    return 0
  fi

  write_status running catalog "" 0 0 "${#keys[@]}"
  local catalog
  if ! catalog="$(catalog_tsv)"; then
    SYNC_ACTIVE=false
    write_status idle "" "" 0 0 "${#keys[@]}" "$missing" problems "The Kiwix catalog could not be fetched (no internet?)."
    return 0
  fi

  local failed=0 row fname size url have index=0
  for key in "${keys[@]}"; do
    index=$(( index + 1 ))
    have="$(latest_local "$key")"
    if [[ -n "$have" && "$update" != true ]]; then
      continue
    fi
    row="$(awk -F'\t' -v k="$key" '$1 == k { print; exit }' <<< "$catalog")"
    if [[ -z "$row" ]]; then
      log_warn "'$key' is not in the Kiwix catalog; check the name."
      failed=$(( failed + 1 ))
      continue
    fi
    IFS=$'\t' read -r _ fname size url <<< "$row"
    if [[ -n "$have" && ! "$fname" > "${have##*/}" ]]; then
      log_ok "Up to date: ${have##*/}"
      continue
    fi
    write_status running downloading "$fname" "$size" "$index" "${#keys[@]}" "$failed"
    if download "$url" "$fname" "$size"; then
      build_library
    else
      failed=$(( failed + 1 ))
    fi
  done

  SYNC_ACTIVE=false
  if (( failed > 0 )); then
    log_warn "Sync finished with $failed problem(s)."
    write_status idle "" "" 0 0 "${#keys[@]}" "$failed" problems "Sync finished with $failed problem(s); see ./manage.sh logs knowledge."
  else
    log_ok "Sync complete."
    write_status idle "" "" 0 0 "${#keys[@]}" 0 ok "All books are up to date."
  fi
}

# cmd_prune [--dry-run] [--locked] - delete files kiwix-serve no longer
# serves: older versions of a key, and keys that are not selected. Also drops
# leftover partial downloads of keys no longer wanted. --locked: the caller
# holds the lock.
cmd_prune() {
  local dry=false locked=false arg
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry=true ;;
      --locked) locked=true ;;
    esac
  done
  [[ "$dry" == true || "$locked" == true ]] || take_lock

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
      grep -qxF "$(zim_key "$f")" <(wanted_keys) || served="$served, not selected"
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

# cmd_apply KEY... - the Library screen's selection: stop a running sync,
# store the selection, delete what is no longer selected, then download the
# rest in the background. An empty list deselects (and deletes) everything.
cmd_apply() {
  local key
  for key in "$@"; do
    if ! valid_key "$key"; then
      log_error "Not a Kiwix name: '$key'"
      exit 2
    fi
  done
  mkdir -p "$ZIM_DIR" "$PARTIAL_DIR" "$CACHE_DIR"
  stop_sync
  take_lock 60
  write_selection "$@"
  log_info "Selection: $# book(s)."
  cmd_prune --locked
  release_lock
  start_sync_bg
}

# seed_selection - installs from before the selection (zims.txt baked into
# the image) keep their books: the first start selects what is on disk.
seed_selection() {
  [[ -f "$SELECTION" ]] && return 0
  local -a keys
  mapfile -t keys < <(installed_keys)
  write_selection "${keys[@]}"
  (( ${#keys[@]} == 0 )) || log_info "Selected the ${#keys[@]} book(s) already on disk."
}

cmd_serve() {
  mkdir -p "$ZIM_DIR" "$PARTIAL_DIR" "$CACHE_DIR"
  seed_selection
  rm -f "$PID_FILE"
  build_library
  # a sync cut off by a crash or power loss still says "running"
  if [[ -f "$STATUS_FILE" ]] && grep -q '"state":"running"' "$STATUS_FILE"; then
    write_status idle "" "" 0 0 0 0 interrupted "The last sync stopped before it finished."
  fi
  if [[ "${AUTO_SYNC:-true}" == true ]] && [[ -n "$(wanted_keys)" ]]; then
    # Background: resumes downloads of selected books (a restart, a power
    # cut); each shows up in kiwix-serve as soon as it is complete.
    start_sync_bg
  fi
  # URL_ROOT: core's passthrough serves kiwix under /svc/library/ (it
  # forwards the path unchanged), so kiwix must generate links with it
  local -a root=()
  [[ -n "${URL_ROOT:-}" ]] && root=(--urlRootLocation="$URL_ROOT")
  exec kiwix-serve --library --monitorLibrary --port="$PORT" \
    --address="${BIND_ADDRESS:-all}" "${root[@]}" "$LIBRARY"
}

case "${1:-}" in
  serve)   cmd_serve ;;
  sync)    shift; cmd_sync "$@" ;;
  sync-bg) shift; start_sync_bg "$@"; log_ok "Sync started; see the container log." ;;
  apply)   shift; cmd_apply "$@" ;;
  prune)   shift; cmd_prune "$@" ;;
  library) build_library; log_ok "Library rebuilt." ;;
  list)    cmd_list ;;
  *) echo "Usage: knowledge serve|apply KEY...|sync [--update]|sync-bg [--update]|prune [--dry-run]|library|list" >&2; exit 1 ;;
esac
