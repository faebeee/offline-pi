# Info

Info shows this documentation inside the app, so you can read it on the
Pi's network without internet. It is module 07, served by core: it has no
container of its own and is always on. Open it with Info in the module nav
(`/info`).

## What it shows

Info reads the Markdown files of the project's `docs/` folder and shows
each file as one page:

- **Chapters** are the folders (for example `03-modules`). The `README.md`
  of a folder is the chapter's own page, with an introduction and a list of
  its pages.
- **Order**: the numbers at the start of folder and file names
  (`01-`, `02-`, ...) set the reading order.
- **Titles**: the first `# ` heading of a file is the page title in the
  navigation.

The start page is `docs/README.md`, the index of all chapters. In the
navigation it is called `Start`.

## Finding your way

- **Chapter navigation**: every chapter with its pages, the current one
  highlighted. On a phone it is folded into one line above the page with
  the current title and the number of pages: tap it to open the list, and
  it folds away again when you pick a page. On a wide screen (900 px and
  up) it is a column at the side, always open.
- **Previous and next**: links at the end of each page lead to the
  previous and the next page in reading order, so you can read the whole
  documentation front to back.
- **Links**: links between pages work in the app. The same links also work
  when you open the files in a file browser or on the project's Git host,
  because they are plain relative links between the files. Links to
  websites open in a new tab and need internet. Mentions of other project
  files (such as `install.sh`) are not links in the app.
- **Version and changelog**: the end of the chapter navigation shows the
  version of outpost you run and links to the
  [Changelog](../07-changelog.md), what changed in each version.

## Search

The `Search the docs` field at the top of the chapter navigation searches
the titles and the text of every page. Type at least two characters. The
list then shows the pages that contain all of your words (in any order),
pages with the words in their title first, each with a short snippet of
the text around your words. Tap one to open it. Clear the field to get the chapter
list back. Search runs on the Pi and needs no internet.

## Reading the docs without the app

The documentation is plain Markdown. If outpost does not start, you can
still read the same pages:

- in the `docs/` folder of the project on the Pi, with any text editor or
  `less`,
- in a file browser or on the project's Git host.

Start with `docs/README.md`. When the app does not start, read
[Troubleshooting](../04-operations/05-troubleshooting.md) first.

## Updates

The docs are built into the core image. They change when outpost is
updated or rebuilt: after `./update.sh`, or after you edit files in
`docs/` and run `./start.sh`. Until then the app shows the version from the
last build. See [Updating](../04-operations/02-updating.md).

## Writing pages

To add or change a page, edit the Markdown files in `docs/`. The rules for
file names, headings and links are in
[Documentation](../06-development/09-documentation.md).
