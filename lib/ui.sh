#!/usr/bin/env bash
# lib/ui.sh - interactive prompts for the scripts: inputs with a default,
# yes/no toggles, arrow-key menus, checkbox lists and a spinner for long
# steps. Plain Bash that also runs on macOS's Bash 3.2; no dependencies.
#
# Everything is drawn on stderr, so the prompts work inside $(...).
#
#   UI_PLAIN=true       line-by-line `read` prompts instead of menus (also
#                       used automatically without a terminal)
#   UI_ASSUME_YES=true  never ask: every prompt takes its default
#   UI_VERBOSE=true     ui_run streams the command's output instead of a
#                       spinner
#   UI_LOG=FILE         where ui_run writes the command's output
#
#   ui_input QUESTION DEFAULT [VALIDATOR]   text, Enter keeps DEFAULT
#   ui_confirm QUESTION y|n                 returns 0 for yes
#   ui_select QUESTION DEFAULT ITEM...      one of ITEMs "value|label|hint"
#   ui_multiselect QUESTION ITEM...         ITEMs "value|label|hint|on";
#                                           the chosen values, commas
#   ui_run MESSAGE COMMAND [ARGS...]        spinner, log on failure
#
# The answer of ui_input, ui_select and ui_multiselect is left in UI_REPLY
# (a global: Bash 3.2 has no namerefs, and printf -v would hit our locals).
#   ui_banner TITLE SUBTITLE / ui_step N TOTAL TITLE / ui_note TEXT

UI_PLAIN="${UI_PLAIN:-false}"
UI_ASSUME_YES="${UI_ASSUME_YES:-false}"
UI_VERBOSE="${UI_VERBOSE:-false}"
UI_LOG="${UI_LOG:-${TMPDIR:-/tmp}/offline-pi.log}"
UI_REPLY=""

if [[ -t 2 && -z "${NO_COLOR:-}" && "${TERM:-dumb}" != dumb ]]; then
  UI_B=$'\033[1m' UI_D=$'\033[2m' UI_R=$'\033[0m' UI_INV=$'\033[7m'
  UI_CYAN=$'\033[36m' UI_GREEN=$'\033[32m' UI_YELLOW=$'\033[33m' UI_RED=$'\033[31m'
else
  UI_B="" UI_D="" UI_R="" UI_INV="" UI_CYAN="" UI_GREEN="" UI_YELLOW="" UI_RED=""
fi

case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
  *UTF-8*|*utf-8*|*UTF8*|*utf8*)
    UI_Q="?" UI_OK="✔" UI_ERR="✖" UI_PTR="❯" UI_ON="◉" UI_OFF="◯" UI_DOT="·" UI_LINE="─" UI_ELL="…"
    UI_SPIN=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) ;;
  *)
    UI_Q="?" UI_OK="+" UI_ERR="x" UI_PTR=">" UI_ON="[x]" UI_OFF="[ ]" UI_DOT="-" UI_LINE="-" UI_ELL="~"
    UI_SPIN=('|' '/' '-' '\') ;;
esac

# ui_fancy - can we draw menus (a terminal on stdin and stderr)?
ui_fancy() {
  [[ "$UI_PLAIN" != true && -t 0 && -t 2 && "${TERM:-dumb}" != dumb ]]
}

ui_cols() {
  local c
  c="$(tput cols 2>/dev/null || true)"
  [[ "$c" =~ ^[0-9]+$ && "$c" -gt 20 ]] || c=80
  echo "$c"
}

# ui_banner TITLE SUBTITLE
ui_banner() {
  echo >&2
  printf '  %s %s %s  %s%s%s\n' "$UI_INV$UI_B" "$1" "$UI_R" "$UI_D" "$2" "$UI_R" >&2
}

# ui_step N TOTAL TITLE - a section header.
ui_step() {
  local title=" $1/$2  $3 " cols line
  cols="$(ui_cols)"
  (( cols > 72 )) && cols=72
  line=""
  while (( ${#line} < cols - ${#title} - 4 )); do line+="$UI_LINE"; done
  printf '\n%s%s%s%s%s%s\n' "$UI_D" "$UI_LINE$UI_LINE" "$UI_R$UI_B" "$title" "$UI_R$UI_D" "$line$UI_R" >&2
}

# ui_note TEXT - an indented, dimmed explanation.
ui_note() {
  printf '  %s%s%s\n' "$UI_D" "$*" "$UI_R" >&2
}

# ui_answered QUESTION ANSWER - the collapsed form of an answered prompt.
ui_answered() {
  printf '%s%s%s %s %s%s %s%s\n' "$UI_GREEN" "$UI_OK" "$UI_R" "$1" "$UI_D" "$UI_DOT" "$UI_R$UI_CYAN$2" "$UI_R" >&2
}

# ------------------------------------------------------------ internals --

_UI_LINES=0

# _ui_draw LINES... - replace what the last _ui_draw drew.
_ui_draw() {
  local line
  if (( _UI_LINES > 0 )); then
    printf '\033[%dA' "$_UI_LINES" >&2
  fi
  printf '\r\033[J' >&2
  for line in "$@"; do
    printf '%s\n' "$line" >&2
  done
  _UI_LINES=$#
}

# _ui_clear - remove what the last _ui_draw drew.
_ui_clear() {
  if (( _UI_LINES > 0 )); then
    printf '\033[%dA\r\033[J' "$_UI_LINES" >&2
  fi
  _UI_LINES=0
}

_UI_STTY=""

# _ui_begin / _ui_end - around a widget: cursor hidden and no echo, so keys
# typed while it redraws don't end up on the screen.
_ui_begin() {
  _UI_LINES=0
  _UI_STTY="$(stty -g 2>/dev/null || true)"
  stty -echo 2>/dev/null || true
  printf '\033[?25l' >&2
  trap '_ui_abort' INT TERM
}

_ui_end() {
  [[ -n "$_UI_STTY" ]] && stty "$_UI_STTY" 2>/dev/null
  printf '\033[?25h' >&2
  trap - INT TERM
}

_ui_abort() {
  [[ -n "$_UI_STTY" ]] && stty "$_UI_STTY" 2>/dev/null
  printf '\033[?25h\n' >&2
  printf '%s%s Cancelled.%s\n' "$UI_RED" "$UI_ERR" "$UI_R" >&2
  exit 130
}

# _ui_key VAR - read one key: up, down, left, right, enter, space, tab,
# backspace, esc or the character.
_ui_key() {
  local k="" rest=""
  IFS= read -rsn1 k || true
  case "$k" in
    $'\033')
      IFS= read -rsn2 -t 1 rest || true
      case "$rest" in
        '[A'|'OA') k=up ;;
        '[B'|'OB') k=down ;;
        '[C'|'OC') k=right ;;
        '[D'|'OD') k=left ;;
        *) k=esc ;;
      esac ;;
    '') k=enter ;;
    ' ') k=space ;;
    $'\t') k=tab ;;
    $'\177'|$'\b') k=backspace ;;
  esac
  printf -v "$1" '%s' "$k"
}

# _ui_fit TEXT WIDTH - TEXT cut to WIDTH characters.
_ui_fit() {
  local text="$1" width="$2"
  if (( width < 4 )); then
    printf ''
  elif (( ${#text} > width )); then
    printf '%s%s' "${text:0:$((width - 1))}" "$UI_ELL"
  else
    printf '%s' "$text"
  fi
}

# --------------------------------------------------------------- inputs --

# ui_input QUESTION DEFAULT [VALIDATOR] - VALIDATOR is a function called
# with the answer; it prints why an answer is wrong and returns non-zero.
ui_input() {
  local question="$1" default="$2" validator="${3:-}" answer err rows=0 cols
  if [[ "$UI_ASSUME_YES" == true ]]; then
    ui_answered "$question" "${default:-(empty)}"
    UI_REPLY="$default"
    return 0
  fi
  cols="$(ui_cols)"
  while true; do
    if ui_fancy; then
      local q=$'\001'"$UI_CYAN"$'\002'"$UI_Q"$'\001'"$UI_R$UI_B"$'\002'" $question"$'\001'"$UI_R$UI_D"$'\002'
      if (( BASH_VERSINFO[0] >= 4 )); then
        # the default is pre-filled and editable
        IFS= read -r -e -i "$default" -p "$q ›"$'\001'"$UI_R"$'\002'" " answer || answer=""
      else
        IFS= read -r -e -p "$q [${default}] ›"$'\001'"$UI_R"$'\002'" " answer || answer=""
      fi
      rows=$(( rows + (${#question} + ${#default} + ${#answer} + 8) / cols + 1 ))
    else
      IFS= read -r -p "$question [${default}]: " answer || answer=""
    fi
    answer="${answer:-$default}"
    if [[ -n "$validator" ]] && ! err="$("$validator" "$answer" 2>&1)"; then
      printf '  %s%s %s%s\n' "$UI_RED" "$UI_ERR" "${err:-Invalid answer.}" "$UI_R" >&2
      rows=$((rows + 1))
      continue
    fi
    break
  done
  if ui_fancy; then
    # collapse the prompt (and earlier error lines) into the answered form
    printf '\033[%dA\r\033[J' "$rows" >&2
    ui_answered "$question" "${answer:-(empty)}"
  fi
  UI_REPLY="$answer"
}

# ui_confirm QUESTION DEFAULT(y|n) - returns 0 for yes, 1 for no.
ui_confirm() {
  local question="$1" default="${2:-n}" yes reply key
  [[ "$default" == y ]] && yes=true || yes=false
  if [[ "$UI_ASSUME_YES" == true ]]; then
    ui_answered "$question" "$([[ $yes == true ]] && echo Yes || echo No)"
    [[ "$yes" == true ]]
    return
  fi
  if ! ui_fancy; then
    local hint="[y/N]"
    [[ "$yes" == true ]] && hint="[Y/n]"
    read -r -p "$question $hint " reply || reply=""
    reply="${reply:-$default}"
    [[ "$reply" =~ ^[Yy] ]]
    return
  fi
  _ui_begin
  while true; do
    local y="Yes" n="No"
    if [[ "$yes" == true ]]; then
      y="$UI_CYAN$UI_B$UI_PTR Yes$UI_R"; n="$UI_D  No$UI_R"
    else
      y="$UI_D  Yes$UI_R"; n="$UI_CYAN$UI_B$UI_PTR No$UI_R"
    fi
    _ui_draw "$UI_CYAN$UI_Q$UI_R $UI_B$question$UI_R  $y  $n   $UI_D(←/→, y/n, enter)$UI_R"
    _ui_key key
    case "$key" in
      left|right|tab|up|down) [[ "$yes" == true ]] && yes=false || yes=true ;;
      y|Y) yes=true; break ;;
      n|N) yes=false; break ;;
      enter) break ;;
    esac
  done
  _ui_clear
  _ui_end
  ui_answered "$question" "$([[ $yes == true ]] && echo Yes || echo No)"
  [[ "$yes" == true ]]
}

# ui_select QUESTION DEFAULT ITEM... - ITEM is "value|label|hint";
# DEFAULT is a value (the first item if it matches none).
ui_select() {
  local question="$1" default="$2"
  shift 2
  local -a values=() labels=() hints=()
  local item i n cur=0 key cols lines
  for item in "$@"; do
    values+=("${item%%|*}")
    item="${item#*|}"
    labels+=("${item%%|*}")
    [[ "$item" == *"|"* ]] && hints+=("${item#*|}") || hints+=("")
  done
  n=${#values[@]}
  for (( i = 0; i < n; i++ )); do
    [[ "${values[$i]}" == "$default" ]] && cur=$i
  done

  if [[ "$UI_ASSUME_YES" == true ]]; then
    :
  elif ! ui_fancy; then
    local reply
    echo "$question" >&2
    for (( i = 0; i < n; i++ )); do
      printf '  %d) %s%s\n' $((i + 1)) "${labels[$i]}" "${hints[$i]:+  (${hints[$i]})}" >&2
    done
    while true; do
      read -r -p "Choose 1-$n [$((cur + 1))]: " reply || reply=""
      reply="${reply:-$((cur + 1))}"
      if [[ "$reply" =~ ^[0-9]+$ ]] && (( reply >= 1 && reply <= n )); then
        cur=$((reply - 1))
        break
      fi
      echo "Enter a number between 1 and $n." >&2
    done
  else
    cols="$(ui_cols)"
    _ui_begin
    while true; do
      lines=("$UI_CYAN$UI_Q$UI_R $UI_B$question$UI_R  $UI_D(↑/↓, enter)$UI_R")
      for (( i = 0; i < n; i++ )); do
        local label hint
        label="$(_ui_fit "${labels[$i]}" $((cols - 6)))"
        hint="$(_ui_fit "${hints[$i]}" $((cols - 8 - ${#label})))"
        if (( i == cur )); then
          lines+=("  $UI_CYAN$UI_PTR $UI_B$label$UI_R${hint:+  $UI_D$hint$UI_R}")
        else
          lines+=("    $label${hint:+  $UI_D$hint$UI_R}")
        fi
      done
      _ui_draw "${lines[@]}"
      _ui_key key
      case "$key" in
        up|k) cur=$(( (cur - 1 + n) % n )) ;;
        down|j|tab) cur=$(( (cur + 1) % n )) ;;
        [1-9]) (( key <= n )) && cur=$((key - 1)) ;;
        enter) break ;;
      esac
    done
    _ui_clear
    _ui_end
  fi
  ui_answered "$question" "${labels[$cur]}"
  UI_REPLY="${values[$cur]}"
}

# ui_multiselect QUESTION ITEM... - ITEM is "value|label|hint|on" (on:
# "on" to pre-select). UI_REPLY gets the chosen values, comma separated, in
# ITEM order.
ui_multiselect() {
  local question="$1"
  shift
  local -a values=() labels=() hints=() on=()
  local item rest i n cur=0 key cols lines result="" shown=""
  for item in "$@"; do
    values+=("${item%%|*}"); rest="${item#*|}"
    labels+=("${rest%%|*}"); rest="${rest#*|}"
    hints+=("${rest%%|*}"); rest="${rest#*|}"
    [[ "$rest" == on ]] && on+=(true) || on+=(false)
  done
  n=${#values[@]}

  if [[ "$UI_ASSUME_YES" == true ]]; then
    :
  elif ! ui_fancy; then
    local reply hint
    echo "$question" >&2
    for (( i = 0; i < n; i++ )); do
      if [[ "${on[$i]}" == true ]]; then hint="[Y/n]"; else hint="[y/N]"; fi
      read -r -p "  ${labels[$i]}${hints[$i]:+ (${hints[$i]})}? $hint " reply || reply=""
      if [[ -z "$reply" ]]; then continue; fi
      [[ "$reply" =~ ^[Yy] ]] && on[$i]=true || on[$i]=false
    done
  else
    cols="$(ui_cols)"
    local width=0
    for (( i = 0; i < n; i++ )); do
      (( ${#labels[$i]} > width )) && width=${#labels[$i]}
    done
    _ui_begin
    while true; do
      lines=("$UI_CYAN$UI_Q$UI_R $UI_B$question$UI_R")
      for (( i = 0; i < n; i++ )); do
        local box label hint ptr="  "
        if [[ "${on[$i]}" == true ]]; then box="$UI_GREEN$UI_ON$UI_R"; else box="$UI_D$UI_OFF$UI_R"; fi
        label="$(printf "%-${width}s" "${labels[$i]}")"
        hint="$(_ui_fit "${hints[$i]}" $((cols - width - 10)))"
        if (( i == cur )); then
          ptr="$UI_CYAN$UI_PTR$UI_R "
          label="$UI_B$label$UI_R"
        fi
        lines+=("  $ptr$box $label  $UI_D$hint$UI_R")
      done
      lines+=("  ${UI_D}↑/↓ move $UI_DOT space select $UI_DOT a all $UI_DOT enter confirm$UI_R")
      _ui_draw "${lines[@]}"
      _ui_key key
      case "$key" in
        up|k) cur=$(( (cur - 1 + n) % n )) ;;
        down|j|tab) cur=$(( (cur + 1) % n )) ;;
        space|x) [[ "${on[$cur]}" == true ]] && on[$cur]=false || on[$cur]=true ;;
        a|A)
          local all=true
          for (( i = 0; i < n; i++ )); do [[ "${on[$i]}" == true ]] || all=false; done
          for (( i = 0; i < n; i++ )); do
            [[ "$all" == true ]] && on[$i]=false || on[$i]=true
          done ;;
        enter) break ;;
      esac
    done
    _ui_clear
    _ui_end
  fi
  for (( i = 0; i < n; i++ )); do
    [[ "${on[$i]}" == true ]] || continue
    result="${result:+$result,}${values[$i]}"
    shown="${shown:+$shown, }${labels[$i]}"
  done
  ui_answered "$question" "${shown:-none}"
  UI_REPLY="$result"
}

# ------------------------------------------------------------------ run --

# _ui_last_line FILE - the last non-empty line of FILE without escape codes
# (progress bars redraw with \r: the last segment counts).
_ui_last_line() {
  tail -c 4000 "$1" 2>/dev/null | tr '\r' '\n' \
    | awk '{ gsub(/\033\[[0-9;?]*[A-Za-z]/, ""); gsub(/[[:cntrl:]]/, "") } NF { l = $0 } END { print l }'
}

_ui_duration() {
  local s="$1"
  if (( s >= 60 )); then printf '%dm %02ds' $((s / 60)) $((s % 60)); else printf '%ds' "$s"; fi
}

# ui_run MESSAGE COMMAND [ARGS...] - run COMMAND (a function works too) with
# a spinner and its latest output line; the full output goes to UI_LOG. On
# failure, shows the end of the log and returns COMMAND's status.
ui_run() {
  local message="$1" start=$SECONDS rc=0
  shift
  printf '\n=== %s: %s\n' "$(date '+%F %T')" "$message" >>"$UI_LOG"
  if [[ "$UI_VERBOSE" == true ]] || ! ui_fancy; then
    printf '%s%s%s %s\n' "$UI_CYAN" "${UI_SPIN[0]}" "$UI_R" "$message..." >&2
    "$@" 2>&1 | tee -a "$UI_LOG" >&2 || rc=${PIPESTATUS[0]}
    if (( rc == 0 )); then
      printf '%s%s%s %s %s(%s)%s\n' "$UI_GREEN" "$UI_OK" "$UI_R" "$message" "$UI_D" "$(_ui_duration $((SECONDS - start)))" "$UI_R" >&2
    else
      printf '%s%s%s %s failed (see %s)\n' "$UI_RED" "$UI_ERR" "$UI_R" "$message" "$UI_LOG" >&2
    fi
    return "$rc"
  fi

  local pid frame=0 cols last="" width
  cols="$(ui_cols)"
  "$@" </dev/null >>"$UI_LOG" 2>&1 &
  pid=$!
  _ui_begin
  trap 'kill "$pid" 2>/dev/null; _ui_abort' INT TERM
  _UI_LINES=0
  while kill -0 "$pid" 2>/dev/null; do
    if (( frame % 5 == 0 )); then
      last="$(_ui_last_line "$UI_LOG")"
    fi
    width=$((cols - 4))
    _ui_draw "$UI_CYAN${UI_SPIN[$((frame % ${#UI_SPIN[@]}))]}$UI_R $(_ui_fit "$message" "$width") $UI_D$(_ui_duration $((SECONDS - start)))$UI_R" \
      "  $UI_D$(_ui_fit "$last" "$width")$UI_R"
    frame=$((frame + 1))
    sleep 0.1
  done
  wait "$pid" || rc=$?
  _ui_clear
  _ui_end
  if (( rc == 0 )); then
    printf '%s%s%s %s %s(%s)%s\n' "$UI_GREEN" "$UI_OK" "$UI_R" "$message" "$UI_D" "$(_ui_duration $((SECONDS - start)))" "$UI_R" >&2
  else
    printf '%s%s %s failed%s\n' "$UI_RED" "$UI_ERR" "$message" "$UI_R" >&2
    tail -n 25 "$UI_LOG" | sed 's/^/  │ /' >&2
    printf '  Full output: %s\n' "$UI_LOG" >&2
  fi
  return "$rc"
}
