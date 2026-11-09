#!/usr/bin/env bash
# ui/sync.sh DEST - copy the Outpost UI package into an app's build tree.
#
# Apps build in their own directory (their container build context), so each
# one gets a copy of this package before it builds: install.sh/start.sh call
# this, and the copy is gitignored. DEST is replaced, so it must be a
# directory named `ui` or `outpost-ui`.
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="${1:?usage: ui/sync.sh DEST}"

case "$(basename "$dest")" in
  ui|outpost-ui) ;;
  *) echo "ui/sync.sh: refusing to replace '$dest' (name it ui or outpost-ui)" >&2; exit 1 ;;
esac

mkdir -p "$dest"
files=(tokens.css fonts.css outpost.css outpost.js outpost.d.ts theme-boot.js icons.svg fonts)
if command -v rsync >/dev/null 2>&1; then
  # no perms/owner: the checkout may live on exFAT
  rsync -a --delete --no-perms --no-owner --no-group \
    "${files[@]/#/$UI_DIR/}" "$dest/"
  # drop files that are no longer part of the package
  for f in "$dest"/*; do
    name="$(basename "$f")"
    [[ " ${files[*]} " == *" $name "* ]] || rm -rf "$f"
  done
else
  rm -rf "${dest:?}"/*
  cp -r "${files[@]/#/$UI_DIR/}" "$dest/"
fi
