# Releases

outpost has one version for the whole app: core, the web app, every
module and the scripts. It is the `version` field of the root
`package.json`. What changed in each version is written down in the
[Changelog](../07-changelog.md), which the Info module shows in the app.

## Version numbers

Versions follow [Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

| Part | Raised when |
|---|---|
| `PATCH` (0.1.0 -> 0.1.1) | Only fixes |
| `MINOR` (0.1.1 -> 0.2.0) | New features, new modules, new settings |
| `MAJOR` (0.2.0 -> 1.0.0) | A change that needs the user to act: a removed setting, data that has to be moved by hand |

While the version starts with `0.`, a breaking change may raise `MINOR`
instead. The workspaces' own `package.json` versions (`apps/*`,
`packages/*`) are not the app's version; leave them alone.

## Between releases

Every change a user or developer notices adds a line under
`## Unreleased` in `docs/07-changelog.md`, in the same commit as the
change, under one of these headings:

- `### Added`: new features, modules, settings, commands.
- `### Changed`: behaviour that works differently now.
- `### Fixed`: bugs.
- `### Removed`: what is gone.

Write for the person running outpost: what changed and what they have to
do, if anything. One line per change, plain English, no commit hashes.
Pure refactorings, typo fixes and changes to the docs alone don't need a
line.

## Making a release

A release is made only when the maintainer decides to, not with every
change.

1. Pick the next version from the changes under `## Unreleased` (see the
   table above).
2. In `docs/07-changelog.md`, rename `## Unreleased` to
   `## <version> (<YYYY-MM-DD>)`, add a one-line summary if it helps, and
   add a new, empty `## Unreleased` (with "Nothing yet.") above it. Check
   that every notable change since the last version is listed (`git log
   v<last>..HEAD`).
3. Set the version in the root `package.json` and run `npm install` so
   `package-lock.json` matches.
4. Commit both files as `Release <version>`.
5. Tag the commit: `git tag -a v<version> -m "outpost <version>"`, then
   push the branch and the tag (`git push --follow-tags`).

`./update.sh` on a Pi then shows the new version number, and the Info
module shows the new changelog after the update.
