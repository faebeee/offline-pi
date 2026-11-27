import os
import time

import pytest
from fastapi.testclient import TestClient

from app.main import MB, Settings, create_app
from app.storage import PathError, Storage, clean_parts

CSRF = {"x-pi-monitor": "1"}


@pytest.fixture
def client(tmp_path):
    settings = Settings(data_dir=tmp_path / "data", max_upload_bytes=1 * MB, min_free_bytes=0)
    return TestClient(create_app(settings))


def test_clean_parts():
    assert clean_parts("") == []
    assert clean_parts("/a//b/./c.txt") == ["a", "b", "c.txt"]
    for bad in ["../x", "a/../../x", ".hidden", "a/.upload-1", "a\\b", "x\x00y", "a/\x01"]:
        with pytest.raises(PathError):
            clean_parts(bad)


def test_symlink_outside_is_refused(tmp_path):
    root = tmp_path / "data"
    s = Storage(root)
    (tmp_path / "secret").mkdir()
    os.symlink(tmp_path / "secret", root / "link")
    with pytest.raises(PathError):
        s.resolve("link/x")


def test_upload_list_download_delete(client):
    r = client.put("/raw/notes.txt", content=b"hello", headers=CSRF)
    assert r.status_code == 201, r.text
    assert r.json()["size"] == 5

    assert client.post("/api/folders", json={"path": "Photos"}).status_code == 201
    listing = client.get("/api/list").json()
    assert [e["name"] for e in listing["entries"]] == ["Photos", "notes.txt"]
    assert listing["entries"][0]["kind"] == "folder"

    r = client.get("/raw/notes.txt")
    assert r.status_code == 200 and r.content == b"hello"
    assert r.headers["content-disposition"].startswith("inline")

    r = client.get("/raw/notes.txt", headers={"range": "bytes=1-2"})
    assert r.status_code == 206 and r.content == b"el"

    assert client.delete("/api/entries", params={"path": "notes.txt"}).status_code == 204
    assert client.get("/raw/notes.txt").status_code == 404


def test_html_is_never_inline(client):
    client.put("/raw/page.html", content=b"<script>alert(1)</script>", headers=CSRF)
    r = client.get("/raw/page.html")
    assert r.headers["content-disposition"].startswith("attachment")
    assert r.headers["content-security-policy"] == "sandbox"
    assert r.headers["content-type"] == "application/octet-stream"


def test_upload_needs_csrf_header(client):
    assert client.put("/raw/a.txt", content=b"x").status_code == 400


def test_upload_conflict_and_overwrite(client):
    client.put("/raw/a.txt", content=b"one", headers=CSRF)
    assert client.put("/raw/a.txt", content=b"two", headers=CSRF).status_code == 409
    assert client.put("/raw/a.txt?overwrite=true", content=b"two", headers=CSRF).status_code == 201
    assert client.get("/raw/a.txt").content == b"two"


def test_upload_too_large_leaves_nothing(client, tmp_path):
    r = client.put("/raw/big.bin", content=b"x" * (MB + 1), headers=CSRF)
    assert r.status_code == 413
    assert not any(p.name.startswith(".upload-") for p in (tmp_path / "data").iterdir())
    assert client.get("/api/list").json()["entries"] == []


def test_upload_into_missing_folder(client):
    assert client.put("/raw/nope/a.txt", content=b"x", headers=CSRF).status_code == 404


def test_move(client):
    client.post("/api/folders", json={"path": "A"})
    client.post("/api/folders", json={"path": "A/B"})
    client.put("/raw/a.txt", content=b"x", headers=CSRF)
    r = client.post("/api/move", json={"from": "a.txt", "to": "A/b.txt"})
    assert r.status_code == 200 and r.json()["path"] == "A/b.txt"
    assert client.post("/api/move", json={"from": "A", "to": "A/B/C"}).status_code == 400
    client.put("/raw/c.txt", content=b"x", headers=CSRF)
    assert client.post("/api/move", json={"from": "c.txt", "to": "A/b.txt"}).status_code == 409


def test_root_is_protected(client):
    assert client.delete("/api/entries", params={"path": ""}).status_code == 400
    assert client.get("/api/list", params={"path": "../"}).status_code == 400


def test_folder_delete_is_recursive(client):
    client.post("/api/folders", json={"path": "A"})
    client.put("/raw/A/x.txt", content=b"x", headers=CSRF)
    assert client.get("/api/list").json()["entries"][0]["items"] == 1
    assert client.delete("/api/entries", params={"path": "A"}).status_code == 204
    assert client.get("/api/list").json()["entries"] == []


def test_status(client):
    client.post("/api/folders", json={"path": "A"})
    client.put("/raw/A/x.txt", content=b"abc", headers=CSRF)
    s = client.get("/api/status").json()
    assert (s["used_bytes"], s["files"], s["folders"]) == (3, 1, 1)
    assert s["max_upload_bytes"] == MB


def test_sweep_stale_uploads(tmp_path):
    root = tmp_path / "data"
    root.mkdir()
    old = root / ".upload-abc"
    old.write_bytes(b"x")
    os.utime(old, (time.time() - 2 * 86400,) * 2)
    fresh = root / ".upload-def"
    fresh.write_bytes(b"x")
    Storage(root)
    assert not old.exists() and fresh.exists()
