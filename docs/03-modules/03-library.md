# Library

The Library keeps offline books on the Pi: medical and first-aid guides,
food and water, repair manuals, survival guides and reference works such as
Wikipedia. They are Kiwix books (ZIM files). Once downloaded, you can read
and search them with no internet. Open it with Library in the module nav
(`/library`).

Nothing is downloaded when you install outpost. You choose the books
yourself.

## The library screen

The screen starts with a `Works offline` banner, then:

- **Full-text search**: a search field with a `LOCAL` badge, a SEARCH IN
  list and the SEARCH button (see [Searching](#searching)).
- **Books**: every installed book with its language, number of articles,
  date and size. `TITLES ONLY` means the book has no full-text index, so
  search finds it by title only. Tap a book to read it.
- The CHOOSE BOOKS button, to add or remove books.

The context line shows the number of books, their total size and the date
of the newest one. The status strip shows `LOCAL · 12 BOOKS`.

## Choosing books

Press CHOOSE BOOKS. The catalog lists curated books by topic. Each row has
a short description, the language, an approximate size and a state badge:

| Badge | Meaning |
|---|---|
| `INSTALLED` | On the Pi and readable |
| `DOWNLOADING` | Downloading now |
| `QUEUED` | Selected, waits for its turn |
| `NOT DOWNLOADED` | Selected, but not on the Pi yet (for example no internet during the last sync) |
| `WILL BE DELETED` | Installed, and you have unticked it |

1. Tick the books you want. Untick an installed book to delete it.
2. Check the summary at the bottom: how many books will be downloaded and
   about how much, how many deleted, and the free space on the library
   disk. A `Probably not enough space` banner warns you when the selection
   does not fit. Books that do not fit are skipped.
3. Press APPLY. If your change deletes books, the button reads
   HOLD TO DELETE `<N>` AND APPLY: hold it for 3 seconds to confirm.
   RESET undoes your changes before you apply.

To add a book that is not in the list, type its Kiwix name in
ANOTHER BOOK BY ITS KIWIX NAME and press ADD. The name is the file name
from `download.kiwix.org/zim/` without the date and `.zim`, for example
`wikipedia_de_all_nopic`. Its size is known once the download starts.

## Downloads (sync)

Downloads need internet and run in the background on the Pi. You can keep
using the Library, or close the browser. While books download, a card
shows `SYNCING`, which book (`BOOK 2 OF 5`), the file name and the
progress, and the strip shows `SYNC 2/5`. Each book appears in the list as
soon as it is complete.

On some disks (for example exFAT drives) the progress bar is missing, but
the download still runs.

When the sync is done, the Books section shows `UP TO DATE`. If it shows
`SYNC PROBLEMS` or `SYNC INTERRUPTED`, a banner explains what happened.
Press RETRY when you have internet again. After a restart of the Pi,
unfinished downloads resume by themselves (unless `KNOWLEDGE_AUTO_SYNC` is
set to `false`).

## Reading

Tap a book to open it in the reader. The pages are Kiwix's own book pages,
with their links and pictures. Use the back button in the header to return
to the Library, or the open-in-new-tab button to read in a separate tab.

At the bottom of the library screen there are links to Kiwix's own views:
a simple library list and the OPDS catalog, for other Kiwix apps on the
network.

## Searching

Type words in FULL-TEXT SEARCH, choose where to search in SEARCH IN and
press SEARCH. You can search all books of one language, or one book.
Books in different languages are searched one language at a time. Results
come in pages. Tap a result to open the article.

Search only covers books with a full-text index. If none has one, the
Library says there is nothing to search.

## Updates and pruning

In CHOOSE BOOKS, press CHECK FOR NEWER VERSIONS to download newer versions
of your installed books. The Library switches to the newest version as soon
as it is complete. The old file stays on disk until you prune it.

Pruning (deleting old versions and books that are no longer selected) is
done on the Pi:

```bash
./manage.sh knowledge list     # installed books, served or missing
./manage.sh knowledge sync     # download missing selected books now
./manage.sh knowledge update   # download newer versions
./manage.sh knowledge prune    # delete old versions, asks first
```

These commands need the Library module to be running. See
[Everyday commands](../04-operations/01-everyday-commands.md).

## Storage needs

Books range from a few MB to very large: some curated collections are over
200 GB. The catalog shows the size of each book and the free space before
you apply. Books live in `KNOWLEDGE_CONTENT_DIR`. For more than a few books,
put it on an SSD: see [Storage](../02-installation/02-storage.md).
