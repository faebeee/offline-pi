#!/usr/bin/env bash
# build-index.sh SRC OUT - assemble the self-contained Library landing page.
#
# kiwix-serve serves exactly one file for its welcome page (--customIndex)
# and nothing else of ours, so everything is inlined: outpost.css with
# tokens.css and fonts.css (WOFF2 as data: URIs), the icon sprite as an
# inline <svg> (icons are <use href="#id">, index.js calls setSprite("")),
# theme-boot.js as a classic script in <head>, and outpost.js + index.js as
# one module. SRC is the container/ dir: index.template.html, index.js and ui/
# (packages/ui, copied there by the Dockerfile). Runs at image build.
set -euo pipefail

src="${1:?usage: build-index.sh SRC OUT}"
out="${2:?usage: build-index.sh SRC OUT}"
ui="$src/ui"

die() { echo "build-index: $*" >&2; exit 1; }

for f in outpost.css tokens.css fonts.css outpost.js theme-boot.js icons.svg; do
  [[ -f "$ui/$f" ]] || die "missing $ui/$f (the Dockerfile copies packages/ui there)"
done

# fonts.css with every url(./fonts/x.woff2) replaced by a data: URI
inline_fonts() {
  local line pre file post
  while IFS= read -r line || [[ -n "$line" ]]; do
    while [[ "$line" =~ ^(.*)url\(\./(fonts/[^\)]+\.woff2)\)(.*)$ ]]; do
      pre="${BASH_REMATCH[1]}" file="${BASH_REMATCH[2]}" post="${BASH_REMATCH[3]}"
      [[ -f "$ui/$file" ]] || die "missing font $ui/$file"
      line="${pre}url(data:font/woff2;base64,$(base64 < "$ui/$file" | tr -d '\n'))${post}"
    done
    [[ "$line" == *"url("* && "$line" != *"url(data:"* ]] && die "unhandled url() in fonts.css: $line"
    printf '%s\n' "$line"
  done < "$ui/fonts.css"
}

# outpost.css with its @import lines replaced by the imported files
inline_css() {
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      '@import "./tokens.css";') cat "$ui/tokens.css" ;;
      '@import "./fonts.css";') inline_fonts ;;
      @import*) die "unhandled import in outpost.css: $line" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$ui/outpost.css"
}

# the sprite, hidden but renderable (display:none can break <use> in some
# browsers)
inline_icons() {
  grep -q '^<svg xmlns="http://www.w3.org/2000/svg">' "$ui/icons.svg" \
    || die "unexpected icons.svg header"
  sed 's#^<svg xmlns="http://www.w3.org/2000/svg">#<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">#' \
    "$ui/icons.svg"
}

tmp="$out.tmp"
mkdir -p "$(dirname "$out")"
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    @@INLINE_CSS@@) inline_css ;;
    @@INLINE_ICONS@@) inline_icons ;;
    @@INLINE_THEME_BOOT@@) cat "$ui/theme-boot.js" ;;
    @@INLINE_OUTPOST_JS@@) cat "$ui/outpost.js" ;;
    @@INLINE_APP_JS@@) cat "$src/index.js" ;;
    *) printf '%s\n' "$line" ;;
  esac
done < "$src/index.template.html" > "$tmp"

grep -q '@@INLINE_' "$tmp" && die "unreplaced marker in output"
grep -qi '</script' <(cat "$ui/theme-boot.js" "$ui/outpost.js" "$src/index.js") && die "</script in inlined JS"
grep -qi '</style' <(inline_css) && die "</style in inlined CSS"
mv -f "$tmp" "$out"
echo "build-index: wrote $out ($(wc -c < "$out") bytes)"
