# Info: the documentation in the app

The Info module (`/info`, number 07) shows the project documentation: the
Markdown files in the repo's [`docs/`](../../docs/README.md) folder. The
files are the source; the screen only renders them, so the docs stay
readable in any editor or file browser when outpost does not start.

It has **no container of its own**: like System and Logs it is served by
core (`"service": "core"` in `module.json`, always on). Its domain lives in
`apps/core/src/domains/info/`, its screen in `apps/web/src/features/info/`.

## How `docs/` becomes pages

| In the folder | In the app |
|---|---|
| `docs/README.md` | `/info`, the start page |
| `docs/02-installation/README.md` | `/info/installation`, the chapter page |
| `docs/02-installation/01-install.md` | `/info/installation/install` |
| Folders and files sorted by name (`01-`, `02-`, ...), `README.md` first | The reading order: navigation, previous / next |
| The first `# ` heading | The page title |
| `[Storage](02-storage.md)`, `../05-reference/01-settings.md#ports` | Links between pages (and to headings) |
| A link to a file outside `docs/` (e.g. `../../AGENTS.md`) | Plain text, marked as a project file |

Numeric prefixes are dropped from the URLs, so renumbering keeps the links
inside the files working but changes nothing else. Markdown is
GitHub-flavoured (tables, task lists, strikethrough), rendered with
`react-markdown` and `remark-gfm` into Outpost's `.doc` style; raw HTML in
the files is shown as text, not executed.

## API

| Endpoint | |
|---|---|
| `GET /api/info` | Every page in reading order: slug, title, depth, file |
| `GET /api/info/page?slug=installation/install` | One page's Markdown, with previous, next and its chapters |
| `GET /api/info/search?q=ssd` | Pages whose title or text contains every word of the query, with a snippet |

core reads the folder on every request (a few dozen small files), so edits
show up without a restart in development.

## Where the files come from

- **Image**: `apps/core/Dockerfile` copies `docs/` to `/app/docs`, so the
  docs match the installed version and update with `./update.sh` or
  `./start.sh`.
- **Development**: core reads the checkout's `docs/` (resolved from its
  `dist/`).
- **Override**: `INFO_DOCS_DIR=/path/to/docs` for core.

How to write and organise pages: [`docs/06-development/09-documentation.md`](../../docs/06-development/09-documentation.md).
