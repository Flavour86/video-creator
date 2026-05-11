from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from server.db.projects import project_id_for_path, touch_recent
from server.main import app
from server.settings import settings


@pytest.mark.asyncio
async def test_upload_saves_file(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    (tmp_path / "media").mkdir()
    (tmp_path / ".vc" / "thumbs").mkdir(parents=True)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/projects/media",
            params={"project": str(tmp_path)},
            files=[("files", ("test.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["filename"] == "test.jpg"
    assert (tmp_path / "media" / "test.jpg").exists()


@pytest.mark.asyncio
async def test_collision_rename(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    media = tmp_path / "media"
    media.mkdir()
    (tmp_path / ".vc" / "thumbs").mkdir(parents=True)
    (media / "photo.jpg").write_bytes(b"\xff\xd8\xff")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/projects/media",
            params={"project": str(tmp_path)},
            files=[("files", ("photo.jpg", b"\xff\xd8\xff" + b"\x00" * 50, "image/jpeg"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert items[0]["filename"] == "photo-2.jpg"
    assert (media / "photo-2.jpg").exists()


@pytest.mark.asyncio
async def test_unsupported_type_rejected(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    (tmp_path / "media").mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/projects/media",
            params={"project": str(tmp_path)},
            files=[("files", ("malware.exe", b"\x4d\x5a", "application/octet-stream"))],
        )

    assert r.status_code == 400
    assert r.json()["error"]["code"] == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_list_media_empty(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    (tmp_path / "media").mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/media", params={"project": str(tmp_path)})

    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_list_media_returns_uploaded(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    media = tmp_path / "media"
    media.mkdir()
    (tmp_path / ".vc" / "thumbs").mkdir(parents=True)
    (media / "img.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/media", params={"project": str(tmp_path)})

    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["filename"] == "img.png"
    assert items[0]["kind"] == "image"


@pytest.mark.asyncio
async def test_project_id_media_routes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text('{"version":1}')
    (tmp_path / "media").mkdir()
    (tmp_path / ".vc" / "thumbs").mkdir(parents=True)
    touch_recent(tmp_path, "Media")
    project_id = project_id_for_path(tmp_path)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        upload = await c.post(
            f"/projects/{project_id}/media",
            files=[("files", ("id.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg"))],
        )
        listed = await c.get(f"/projects/{project_id}/media")

    assert upload.status_code == 200
    assert listed.status_code == 200
    assert listed.json()[0]["filename"] == "id.jpg"
