from __future__ import annotations

import hashlib
from pathlib import Path

import httpx
import pytest
from schemas import Dimensions  # type: ignore[import-not-found]

from server.main import app
from server.pipeline.clip_render import _resolve_media_path
from server.routes import uploads as uploads_route
from server.settings import settings

TEN_MIB = 10 * 1024 * 1024


@pytest.mark.asyncio
async def test_uploads_saves_to_root_uploads_and_returns_media_id(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    payload = b"RIFF" + b"\x00" * 100

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("test.wav", payload, "audio/wav"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["mediaId"] == "test.wav"
    assert items[0]["media"]["id"] == "test.wav"
    assert items[0]["media"]["path"] == "uploads/test.wav"
    assert items[0]["media"]["hash"] == hashlib.sha256(payload).hexdigest()
    assert (tmp_path / "uploads" / "test.wav").exists()


@pytest.mark.asyncio
async def test_uploads_collision_rename(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    (uploads / "photo.wav").write_bytes(b"RIFF\x00\x00")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("photo.wav", b"RIFF" + b"\x00" * 50, "audio/wav"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert items[0]["mediaId"] == "photo-2.wav"
    assert (uploads / "photo-2.wav").exists()


@pytest.mark.asyncio
async def test_uploads_deduplicates_same_content(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    payload = b"RIFF" + b"\x11" * 64
    (uploads / "photo.wav").write_bytes(payload)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        first = await c.post(
            "/uploads",
            files=[("files", ("photo-copy.wav", payload, "audio/wav"))],
        )
        second = await c.post(
            "/uploads",
            files=[("files", ("photo-copy.wav", payload, "audio/wav"))],
        )

    assert first.status_code == 200
    assert second.status_code == 200
    first_items = first.json()
    second_items = second.json()
    assert first_items[0]["mediaId"] == "photo.wav"
    assert second_items == first_items
    assert not (uploads / "photo-copy.wav").exists()


@pytest.mark.asyncio
async def test_uploads_rejects_file_larger_than_10m(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    payload = b"R" * (TEN_MIB + 1)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("huge.wav", payload, "audio/wav"))],
        )

    assert r.status_code == 413
    assert r.json()["error"]["code"] == "FILE_TOO_LARGE"


@pytest.mark.asyncio
async def test_uploads_chunked_split_completes_within_20m(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    payload = b"R" * (12 * 1024 * 1024)
    half = len(payload) // 2
    upload_id = "movie-wav-12m"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        first = await c.post(
            "/uploads",
            data={
                "upload_id": upload_id,
                "chunk_index": "0",
                "chunk_count": "2",
                "original_name": "movie.wav",
                "original_size": str(len(payload)),
            },
            files=[("files", ("movie.wav", payload[:half], "audio/wav"))],
        )
        second = await c.post(
            "/uploads",
            data={
                "upload_id": upload_id,
                "chunk_index": "1",
                "chunk_count": "2",
                "original_name": "movie.wav",
                "original_size": str(len(payload)),
            },
            files=[("files", ("movie.wav", payload[half:], "audio/wav"))],
        )

    assert first.status_code == 200
    assert first.json() == []
    assert second.status_code == 200
    items = second.json()
    assert items[0]["mediaId"] == "movie.wav"
    assert items[0]["media"]["hash"] == hashlib.sha256(payload).hexdigest()
    assert (tmp_path / "uploads" / "movie.wav").read_bytes() == payload


@pytest.mark.asyncio
async def test_uploads_rejects_images_smaller_than_5x5(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    monkeypatch.setattr(uploads_route, "_probe_dimensions", lambda _path: Dimensions(width=4, height=4))
    monkeypatch.setattr(uploads_route, "_make_thumb", lambda _src, _thumb: False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("tiny.png", b"not-a-real-png", "image/png"))],
        )

    assert r.status_code == 400
    assert r.json()["error"]["code"] == "IMAGE_TOO_SMALL"


@pytest.mark.asyncio
async def test_uploads_rejects_corrupt_video(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    monkeypatch.setattr(uploads_route, "_probe_dimensions", lambda _path: None)
    monkeypatch.setattr(uploads_route, "_probe_duration", lambda _path: None)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("bad.mp4", b"not-a-video", "video/mp4"))],
        )

    assert r.status_code == 400
    assert r.json()["error"]["code"] == "CORRUPT_MEDIA"


@pytest.mark.asyncio
async def test_uploads_keeps_import_when_thumbnail_generation_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    monkeypatch.setattr(uploads_route, "_probe_dimensions", lambda _path: Dimensions(width=1280, height=720))
    monkeypatch.setattr(uploads_route, "_make_thumb", lambda _src, _thumb: False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post(
            "/uploads",
            files=[("files", ("frame.png", b"fake-png", "image/png"))],
        )

    assert r.status_code == 200
    items = r.json()
    assert items[0]["media"]["thumb_path"] is None


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


@pytest.mark.asyncio
async def test_uploaded_media_file_route_serves_assets(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path)
    uploads = tmp_path / "uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    payload = b"\xff\xd8\xff" + b"\x00" * 32
    (uploads / "preview.jpg").write_bytes(payload)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/uploads/media-file", params={"filename": "preview.jpg"})

    assert r.status_code == 200
    assert r.content == payload


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
