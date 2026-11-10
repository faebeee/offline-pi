# Documentation

These docs are plain Markdown files in the `docs/` folder of the project.
The same files are read in three places: in an editor or file browser, on
the project's Git host, and in the app's Info module. This page explains how
they are organised and how to write them so they work in all three.

## Structure

```text
docs/
  README.md                    # the index: chapters and first help
  01-overview/
    README.md                  # the chapter page: intro and its pages
    01-how-it-works.md
    02-hardware.md
  02-installation/
    README.md
    01-install.md
    ...
```

- **A folder is a chapter.** Its `README.md` is the chapter page: a short
  intro, then `## Pages` with a link and one line for each page.
- **Numeric prefixes set the order** (`01-`, `02-`). Files and folders are
  sorted by them, in the app and in a file browser.
- **The prefixes are dropped from URLs in the app.**
  `docs/02-installation/01-install.md` is `/info/installation/install`.
- **The first `# ` heading is the title.** It names the page in the app's
  navigation, so keep it short. One H1 per file, on the first line.
- `docs/06-development/plans/` holds historical plans. They are kept as
  they are.

## Links

Use only **relative links to `.md` files inside `docs/`**, anchors allowed:

```markdown
See [Storage](../02-installation/02-storage.md#moving-data).
```

Such links work in a file browser, on a Git host and in the app, which
turns them into its own routes.

Files outside `docs/` (source files, `AGENTS.md`, `compose.yml`) are not
part of the app: a link to them is shown as plain text there. Write repo
paths as inline code instead, for example `apps/core/src/main.ts`.

## Markdown

- GitHub-flavoured Markdown: tables, task lists, strikethrough, fenced code
  blocks. Give every code block a language (`bash`, `ts`, `json`, `text`).
- **No raw HTML.** The app doesn't render it.
- **No images** yet.
- Tables for settings, endpoints and fields; lists for steps.

## The Info module

The Info screen shows these docs inside offline-pi, with navigation and
search.

| Part | Where |
|---|---|
| Manifest | `apps/info/module.json` (served by core, no container) |
| API | core's domain `apps/core/src/domains/info/` |
| Screen | `apps/web/src/features/info/` |

Core reads the `docs/` folder at runtime:

- **In the image**: core's Dockerfile copies `docs/` into the image, so the
  docs match the installed version.
- **In development**: core reads the checkout's `docs/`. Set
  `INFO_DOCS_DIR` to read another folder.

After editing the docs, run `./start.sh` (it rebuilds core's image) or, in
development, refresh the page.

## Writing style

- Plain English, short sentences, direct. Like a good README, not a
  brochure.
- No marketing, no emoji, no exclamation marks.
- No em dashes or en dashes as punctuation. Use commas, colons, parentheses
  or full stops.
- Say what the reader does and what happens, with the exact command or path.
- User-facing chapters (1 to 4) explain how to use offline-pi; the
  reference and development chapters can assume the reader knows the
  basics.
- When a fact comes from a file in the checkout, check it there. Don't
  describe behaviour you haven't seen in the code.

## Adding a page

1. Create the file in the right chapter with the next free number, for
   example `docs/04-operations/06-monitoring.md`.
2. Start it with a short `# ` title.
3. Add it to the chapter's `README.md` under `## Pages`, with one line on
   what it covers.
4. Link to it from related pages where a reader would look for it.

To put a page between two others, renumber the ones after it and fix the
links to them.

## Adding a chapter

1. Create a folder with the next free number, for example `docs/07-faq/`.
2. Add its `README.md` with a `# ` title, an intro and `## Pages`.
3. Add the chapter to the table in `docs/README.md`.

## Checklist

- [ ] One `# ` heading, first line, short
- [ ] Listed in the chapter's `README.md`
- [ ] Relative links to `.md` files only; repo paths as inline code
- [ ] No raw HTML, no images, no em dashes
- [ ] Facts checked against the code
