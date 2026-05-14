from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from server.main import app
from server.pipeline.clip_render import _resolve_media_path
from server.settings import settings


@pytest.mark.asyncio
async def test_uploads_saves_to_root_uploads_and_returns_media_id(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("test.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["mediaId"] == "test.jpg"
    assert items[0]["media"]["id"] == "test.jpg"
    assert items[0]["media"]["path"] == "uploads/test.jpg"
    assert (tmp_path / "uploads" / "test.jpg").exists()


@pytest.mark.asyncio
async def test_uploads_collision_rename(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / "photo.jpg").write_bytes(b"\xff\xd8\xff")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("photo.jpg", b"\xff\xd8\xff" + b"\x00" * 50, "image/jpeg"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert items[0]["mediaId"] == "photo-2.jpg"
    assert (uploads / "photo-2.jpg").exists()


@pytest.mark.asyncio
async def test_uploads_rejects_unsupported_type(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("malware.exe", b"\x4d\x5a", "application/octet-stream"))],
        )

    assert r.status_code == 400
    assert r.json()["error"]["code"] == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_legacy_projects_media_route_removed(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    (tmp_path / "project.json").write_text('{"version":1}')

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/projects/media",
            params={"project": str(tmp_path)},
            files=[("files", ("test.jpg", b"\xff\xd8\xff" + b"\x00" * 100, "image/jpeg"))],
        )

    assert r.status_code == 410
    assert r.json()["error"]["code"] == "LEGACY_MEDIA_ROUTE_REMOVED"


def test_clip_resolver_falls_back_to_root_uploads(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    project_dir = tmp_path / "projects" / "demo"
    (project_dir / "media").mkdir(parents=True)
    upload_path = tmp_path / "uploads" / "bg.jpg"
    upload_path.parent.mkdir(parents=True)
    upload_path.write_bytes(b"\xff\xd8\xff")

    resolved = _resolve_media_path(project_dir, "bg.jpg")

    assert resolved == upload_path
