#!/usr/bin/env bash
# scripts/release-notes.sh VERSION - print the changelog section of VERSION
# (docs/07-changelog.md, "## <version> (<date>)" up to the next "## "),
# without its heading. CI uses it as the text of the GitHub Release
# (.github/workflows/images.yml, job "release"). Fails when the section is
# missing or empty.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."
ROOT_DIR="$(pwd)"

version="${1:-}"
version="${version#v}"
if [[ -z "$version" ]]; then
  echo "Usage: $0 VERSION" >&2
  exit 1
fi

notes="$(awk -v v="$version" '
  index($0, "## " v " ") == 1 || $0 == "## " v { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$ROOT_DIR/docs/07-changelog.md")"

# drop leading and trailing empty lines
notes="$(printf '%s\n' "$notes" | awk 'NF { started = 1 } started { lines[++n] = $0 } END { while (n > 0 && lines[n] == "") n--; for (i = 1; i <= n; i++) print lines[i] }')"

if [[ -z "$notes" ]]; then
  echo "No section '## $version (...)' in docs/07-changelog.md." >&2
  exit 1
fi
printf '%s\n' "$notes"
