"""Files module: a shared folder for everyone on the Pi's network.

No UI here: core's files domain (/api/files/...) is the JSON API the web app
uses (list, folders, rename, delete). The file bytes go through core's
passthrough (/svc/files/raw/<path>): GET to download (range requests work),
PUT to upload, streamed in both directions.
"""

from __future__ import annotations

import logging
import mimetypes
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from .storage import Conflict, NotFound, PathError, Storage, TooLarge

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("files")

MB = 1024**2
USAGE_TTL_S = 30

# shown in the browser; anything else is downloaded
SAFE_INLINE = ("image/", "audio/", "video/", "text/plain", "text/csv", "application/pdf")
UNSAFE = {"image/svg+xml"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    max_upload_bytes: int
    min_free_bytes: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            data_dir=Path(os.environ.get("DATA_DIR", "/app/data")),
            max_upload_bytes=int(os.environ.get("FILES_MAX_UPLOAD_MB") or 4096) * MB,
            min_free_bytes=int(os.environ.get("FILES_MIN_FREE_MB") or 1024) * MB,
        )


class FolderBody(BaseModel):
    path: str = Field(min_length=1, max_length=4096)


class MoveBody(BaseModel):
    source: str = Field(alias="from", min_length=1, max_length=4096)
    to: str = Field(min_length=1, max_length=4096)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    storage = Storage(settings.data_dir)
    app = FastAPI(title="outpost files")

    @app.exception_handler(PathError)
    async def _bad(_: Request, err: PathError):
        return JSONResponse({"detail": str(err)}, status_code=400)

    @app.exception_handler(NotFound)
    async def _missing(_: Request, err: NotFound):
        return JSONResponse({"detail": str(err)}, status_code=404)

    @app.exception_handler(Conflict)
    async def _conflict(_: Request, err: Conflict):
        return JSONResponse({"detail": str(err)}, status_code=409)

    @app.exception_handler(TooLarge)
    async def _large(_: Request, err: TooLarge):
        return JSONResponse({"detail": str(err)}, status_code=err.status)

    usage_cache: dict[str, Any] = {"at": float("-inf"), "value": (0, 0, 0)}

    @app.get("/api/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        # walking a large folder takes a while on an SD card: at most every 30 s
        if time.monotonic() - usage_cache["at"] > USAGE_TTL_S:
            usage_cache["value"] = storage.usage()
            usage_cache["at"] = time.monotonic()
        used, files, folders = usage_cache["value"]
        return {
            "used_bytes": used,
            "files": files,
            "folders": folders,
            "free_bytes": storage.free_bytes(),
            "max_upload_bytes": settings.max_upload_bytes,
            "min_free_bytes": settings.min_free_bytes,
        }

    @app.get("/api/list")
    def list_folder(path: str = "") -> dict[str, Any]:
        rel, entries = storage.list(path)
        return {"path": rel, "entries": [e.as_dict() for e in entries]}

    @app.post("/api/folders", status_code=201)
    def mkdir(body: FolderBody) -> dict[str, Any]:
        entry = storage.mkdir(body.path)
        log.info("folder created: %s", entry.path)
        usage_cache["at"] = float("-inf")
        return entry.as_dict()

    @app.post("/api/move")
    def move(body: MoveBody) -> dict[str, Any]:
        entry = storage.move(body.source, body.to)
        log.info("moved %s -> %s", body.source, entry.path)
        return entry.as_dict()

    @app.delete("/api/entries", status_code=204)
    def delete(path: str) -> None:
        storage.delete(path)
        log.info("deleted %s", path)
        usage_cache["at"] = float("-inf")

    # ------------------------------------------------------------- raw bytes

    @app.get("/raw/{path:path}")
    def download(path: str, download: bool = False) -> FileResponse:
        full, _ = storage.file(path)
        mime, _ = mimetypes.guess_type(full.name)
        # files come from anyone on the network: whatever a browser could run
        # as a page of this origin (HTML, SVG, XML, scripts) is only ever
        # downloaded, never shown inline
        safe = mime is not None and mime.startswith(SAFE_INLINE) and mime not in UNSAFE
        disposition = "inline" if safe and not download else "attachment"
        headers = {
            "content-disposition": f"{disposition}; filename*=UTF-8''{quote(full.name)}",
            "x-content-type-options": "nosniff",
            "cache-control": "no-cache",
        }
        if not safe:
            headers["content-security-policy"] = "sandbox"
        return FileResponse(full, media_type=mime if safe else "application/octet-stream", headers=headers)

    @app.put("/raw/{path:path}", status_code=201)
    async def upload(path: str, request: Request, overwrite: bool = False) -> dict[str, Any]:
        # a cross-site page can't set this header without a CORS preflight,
        # which nothing here answers (CSRF guard, like core's API)
        if request.headers.get("x-pi-monitor") != "1":
            raise HTTPException(400, "missing X-Pi-Monitor header")
        raw_length = request.headers.get("content-length")
        length = int(raw_length) if raw_length and raw_length.isdigit() else None
        up = storage.upload(
            path,
            overwrite=overwrite,
            max_bytes=settings.max_upload_bytes,
            min_free=settings.min_free_bytes,
            length=length,
        )
        try:
            async for chunk in request.stream():
                up.write(chunk)
            entry = up.commit()
        except BaseException:
            up.abort()
            raise
        log.info("uploaded %s (%d bytes)", entry.path, entry.size or 0)
        usage_cache["at"] = float("-inf")
        return entry.as_dict()

    return app
