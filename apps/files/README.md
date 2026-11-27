# files

A shared folder on the Pi for everyone on its network or hotspot. Open
`http://<pi>:8080/files` to upload files (button or drag and drop), make
folders, rename, download and delete. User guide:
[docs/03-modules/11-files.md](../../docs/03-modules/11-files.md).

Files is a screen core serves itself: this folder holds only its manifest
(`"service": "core"`, `"optional": false`, `"nav": "apps"`). There is no
container and nothing to install; the code is core's `files` domain
(`apps/core/src/domains/files/`) and the screen `apps/web/src/features/files/`.

## How it works

```
browser ──> core /api/files/*            list, folders, move, delete (JSON)
        ──> core /api/files/raw/<path>   GET download, PUT upload (streamed)
                    └─ SharedFolder: FILES_DATA_DIR, mounted into core at /app/files
```

- **Bytes stream, never buffered.** A `PUT` of the raw body (the web app
  uses `XMLHttpRequest` for the progress bar, always as
  `application/octet-stream`, since core parses JSON bodies) is written to
  `.upload-<random>` next to the target and renamed into place only when
  complete, so a cut-off upload leaves nothing visible. Leftovers older
  than a day are removed when core starts. A `PUT` needs `X-Pi-Monitor: 1`.
- **Limits**: `FILES_MAX_UPLOAD_MB` per file, and every upload must leave
  `FILES_MIN_FREE_MB` free on the disk (`413` / `507` otherwise).
- **Paths** are relative to the folder and checked: no `..`, no absolute
  paths, no names starting with a dot (hidden, reserved for uploads in
  progress), no control characters, at most 16 levels; symlinks placed by
  hand may not lead outside.
- **Downloads**: images, audio, video, PDF and plain text are served
  inline; everything else, HTML and SVG included, as an attachment with
  `Content-Security-Policy: sandbox` and `nosniff`, so an uploaded page
  can't run as part of outpost. Range requests work (video seeking,
  resumed downloads).
- **Deleting** is a control action (`CONTROL_PIN`); listing, uploading,
  folders and renaming are open to everyone on the network.
- The status (size of the folder) is measured at most every 30 s.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `FILES_DATA_DIR` | `<OUTPOST_DATA_DIR>/files` | The shared folder. Grows with every upload. |
| `FILES_MAX_UPLOAD_MB` | `4096` | Largest file per upload. |
| `FILES_MIN_FREE_MB` | `1024` | Free space every upload must leave. |
