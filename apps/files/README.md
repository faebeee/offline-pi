# files

A shared folder on the Pi for everyone on its network or hotspot. Open
`http://<pi>:8080/files` to upload files (button or drag and drop), make
folders, rename, download and delete. User guide:
[docs/03-modules/11-files.md](../../docs/03-modules/11-files.md).

## How it works

```
browser ──> core /api/files/*          list, folders, move, delete (JSON)
        ──> core /svc/files/raw/<path> GET download, PUT upload (streamed)
                    └──> files :8086 (rootless container, FastAPI)
                          └─ DATA_DIR (FILES_DATA_DIR): plain files and folders
```

- **Bytes don't go through the API.** Uploads and downloads stream through
  core's passthrough, so a 4 GB video never sits in memory. An upload is a
  `PUT` of the raw body (the web app uses `XMLHttpRequest` for the progress
  bar); it is written to `.upload-<random>` next to the target and renamed
  into place only when complete, so a cut-off upload leaves nothing
  visible. Leftovers older than a day are removed when the container
  starts. A `PUT` needs `X-Pi-Monitor: 1` (CSRF guard, like core's API).
- **Limits**: `FILES_MAX_UPLOAD_MB` per file, and every upload must leave
  `FILES_MIN_FREE_MB` free on the disk (`413` / `507` otherwise).
- **Paths** are relative to `DATA_DIR`, checked in `app/storage.py`: no
  `..`, no absolute paths, no names starting with a dot (hidden, reserved
  for uploads in progress), no control characters, at most 16 levels;
  symlinks placed by hand may not lead outside.
- **Downloads**: images, audio, video, PDF and plain text are served
  inline; everything else, including HTML and SVG, as an attachment with
  `Content-Security-Policy: sandbox` and `nosniff`, so an uploaded page
  can't run as part of outpost's origin. Range requests work (video
  seeking, resumed downloads).
- **Deleting** is a control action in core (`CONTROL_PIN`); listing,
  uploading, folders and renaming are open to everyone on the network.
- `GET /api/status` walks the folder for its size (cached 30 s); the health
  check uses the cheap `GET /api/health`.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `FILES_PORT` | `8086` | Internal port (loopback). |
| `FILES_DATA_DIR` | `./data/files` | The shared folder. Grows: point it at the SSD. |
| `FILES_MAX_UPLOAD_MB` | `4096` | Largest file per upload. |
| `FILES_MIN_FREE_MB` | `1024` | Free space every upload must leave. |

`./install.sh` asks for `FILES_DATA_DIR` on every run and moves the files
when it changes (`lib/modules/files.sh`).

## Development

```sh
cd apps/files
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
DATA_DIR=./data .venv/bin/uvicorn app.main:create_app --factory --port 8086
```

Core's domain is `apps/core/src/domains/files/`, the screen
`apps/web/src/features/files/`.
