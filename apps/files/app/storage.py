"""The shared folder on disk (DATA_DIR, FILES_DATA_DIR on the host).

Every path the API takes is relative to the root, "/"-separated, and is
checked here: no "..", no absolute paths, no hidden names (a leading dot is
reserved for uploads in progress, ".upload-*"), no control characters.
"""

from __future__ import annotations

import mimetypes
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

MAX_NAME = 255
MAX_DEPTH = 16
UPLOAD_PREFIX = ".upload-"
STALE_UPLOAD_S = 24 * 3600


class PathError(ValueError):
    """A path the user gave is not allowed (400)."""


class Conflict(Exception):
    """The target exists already or the folder is not empty (409)."""


class NotFound(Exception):
    """No such file or folder (404)."""


class TooLarge(Exception):
    """The upload is over the size limit or the disk would fill up (413/507)."""

    def __init__(self, message: str, status: int = 413) -> None:
        super().__init__(message)
        self.status = status


@dataclass
class Entry:
    name: str
    path: str
    kind: str  # "file" | "folder"
    size: int | None
    modified: int
    mime: str | None
    items: int | None  # folders: entries directly inside

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def clean_parts(path: str) -> list[str]:
    """'a/b/c.txt' -> ['a', 'b', 'c.txt']; '' or '/' -> [] (the root)."""
    if "\x00" in path or "\\" in path:
        raise PathError("Paths may not contain backslashes or NUL.")
    parts = [p for p in path.strip("/").split("/") if p not in ("", ".")]
    if len(parts) > MAX_DEPTH:
        raise PathError(f"Folders can be at most {MAX_DEPTH} levels deep.")
    for p in parts:
        check_name(p)
    return parts


def check_name(name: str) -> str:
    if not name or name in (".", ".."):
        raise PathError("A name can't be empty, '.' or '..'.")
    if name.startswith("."):
        raise PathError("Names can't start with a dot.")
    if "/" in name or "\\" in name or "\x00" in name:
        raise PathError("A name can't contain / or \\.")
    if any(ord(c) < 32 for c in name):
        raise PathError("A name can't contain control characters.")
    if len(name.encode()) > MAX_NAME:
        raise PathError(f"A name can be at most {MAX_NAME} bytes long.")
    return name


class Storage:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.root_real = self.root.resolve()
        self.sweep_uploads()

    # ------------------------------------------------------------ paths

    def resolve(self, path: str) -> tuple[Path, str]:
        """(absolute path, normalized relative path); never outside the root."""
        parts = clean_parts(path)
        full = self.root.joinpath(*parts)
        # a symlink placed on the disk by hand must not lead outside
        real = full.resolve()
        if real != self.root_real and self.root_real not in real.parents:
            raise PathError("That path leads outside the shared folder.")
        return full, "/".join(parts)

    def entry(self, full: Path, rel: str) -> Entry:
        st = full.stat()
        if full.is_dir():
            try:
                items = sum(1 for c in full.iterdir() if not c.name.startswith("."))
            except OSError:
                items = None
            return Entry(full.name or "", rel, "folder", None, int(st.st_mtime), None, items)
        mime, _ = mimetypes.guess_type(full.name)
        return Entry(full.name, rel, "file", st.st_size, int(st.st_mtime), mime, None)

    # ------------------------------------------------------------ reading

    def list(self, path: str) -> tuple[str, list[Entry]]:
        full, rel = self.resolve(path)
        if not full.exists():
            raise NotFound(f"'{rel or '/'}' does not exist.")
        if not full.is_dir():
            raise PathError(f"'{rel}' is a file, not a folder.")
        out = []
        for child in full.iterdir():
            if child.name.startswith("."):
                continue
            try:
                out.append(self.entry(child, f"{rel}/{child.name}" if rel else child.name))
            except OSError:
                continue  # vanished meanwhile, or a broken link
        out.sort(key=lambda e: (e.kind != "folder", e.name.casefold()))
        return rel, out

    def file(self, path: str) -> tuple[Path, str]:
        full, rel = self.resolve(path)
        if not rel or not full.is_file():
            raise NotFound(f"'{rel or '/'}' is not a file.")
        return full, rel

    def usage(self) -> tuple[int, int, int]:
        """(bytes, files, folders) under the root."""
        total = files = folders = 0
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            folders += len(dirnames)
            for f in filenames:
                if f.startswith("."):
                    continue
                try:
                    total += os.lstat(os.path.join(dirpath, f)).st_size
                    files += 1
                except OSError:
                    pass
        return total, files, folders

    def free_bytes(self) -> int | None:
        try:
            return shutil.disk_usage(self.root).free
        except OSError:
            return None

    # ------------------------------------------------------------ changing

    def mkdir(self, path: str) -> Entry:
        full, rel = self.resolve(path)
        if not rel:
            raise PathError("Give the new folder a name.")
        if not full.parent.is_dir():
            raise NotFound("The folder it should go into does not exist.")
        if full.exists():
            raise Conflict(f"'{full.name}' exists already.")
        full.mkdir()
        return self.entry(full, rel)

    def move(self, src: str, dst: str) -> Entry:
        s, srel = self.resolve(src)
        d, drel = self.resolve(dst)
        if not srel or not drel:
            raise PathError("The top folder can't be moved.")
        if not s.exists():
            raise NotFound(f"'{srel}' does not exist.")
        if not d.parent.is_dir():
            raise NotFound("The target folder does not exist.")
        if srel == drel:
            return self.entry(s, srel)
        if d.exists() and not (s.samefile(d) and s.name != d.name):  # allow a change of case only
            raise Conflict(f"'{d.name}' exists already.")
        if s.is_dir() and (drel == srel or drel.startswith(srel + "/")):
            raise PathError("A folder can't be moved into itself.")
        os.rename(s, d)
        return self.entry(d, drel)

    def delete(self, path: str) -> None:
        full, rel = self.resolve(path)
        if not rel:
            raise PathError("The top folder can't be deleted.")
        if not full.exists() and not full.is_symlink():
            raise NotFound(f"'{rel}' does not exist.")
        if full.is_dir() and not full.is_symlink():
            shutil.rmtree(full)
        else:
            full.unlink()

    def upload(self, path: str, *, overwrite: bool, max_bytes: int, min_free: int, length: int | None) -> "Upload":
        """Start an upload: a temp file next to the target, renamed into place by commit()."""
        full, rel = self.resolve(path)
        if not rel:
            raise PathError("Give the file a name.")
        if not full.parent.is_dir():
            raise NotFound("The folder it should go into does not exist.")
        if full.is_dir():
            raise Conflict(f"'{full.name}' is a folder.")
        if full.exists() and not overwrite:
            raise Conflict(f"'{full.name}' exists already.")
        if length is not None:
            self._check_room(length, max_bytes, min_free)
        return Upload(self, full, rel, overwrite=overwrite, max_bytes=max_bytes, min_free=min_free, length=length)

    def _check_room(self, length: int, max_bytes: int, min_free: int) -> None:
        if length > max_bytes:
            raise TooLarge(f"The file is larger than the limit of {max_bytes // 1024**2} MB.")
        free = self.free_bytes()
        if free is not None and free - length < min_free:
            raise TooLarge("Not enough free space on the disk for this file.", status=507)

    def sweep_uploads(self, now: float | None = None) -> int:
        """Remove temp files of uploads that were cut off (older than a day)."""
        now = now or time.time()
        removed = 0
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for f in filenames:
                if f.startswith(UPLOAD_PREFIX):
                    p = Path(dirpath) / f
                    try:
                        if now - p.stat().st_mtime > STALE_UPLOAD_S:
                            p.unlink()
                            removed += 1
                    except OSError:
                        pass
        return removed


class Upload:
    """One upload in progress: write() the chunks, then commit() or abort()."""

    def __init__(self, storage: Storage, full: Path, rel: str, *, overwrite: bool, max_bytes: int, min_free: int, length: int | None) -> None:
        self.storage = storage
        self.full = full
        self.rel = rel
        self.overwrite = overwrite
        self.max_bytes = max_bytes
        self.min_free = min_free
        self.length = length
        self.written = 0
        self.tmp = full.parent / f"{UPLOAD_PREFIX}{uuid.uuid4().hex}"
        self.f: BinaryIO | None = open(self.tmp, "wb")

    def write(self, chunk: bytes) -> None:
        if not chunk or self.f is None:
            return
        self.written += len(chunk)
        if self.written > self.max_bytes:
            raise TooLarge(f"The file is larger than the limit of {self.max_bytes // 1024**2} MB.")
        self.f.write(chunk)

    def commit(self) -> Entry:
        assert self.f is not None
        self.f.close()
        self.f = None
        if self.length is not None and self.written != self.length:
            raise PathError("The upload was cut off. Try again.")
        if self.length is None:
            # no length known up front: check the room afterwards
            self.storage._check_room(0, self.max_bytes, self.min_free)
        if self.full.exists() and not self.overwrite:
            raise Conflict(f"'{self.full.name}' exists already.")
        os.replace(self.tmp, self.full)
        return self.storage.entry(self.full, self.rel)

    def abort(self) -> None:
        if self.f is not None:
            self.f.close()
            self.f = None
        self.tmp.unlink(missing_ok=True)
