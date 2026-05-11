"""Tests for GET /projects/load and GET /projects/media-file — TDD."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.db.project_configs import save_config_snapshot
from server.main import app
from server.settings import settings

_BASE = {
    "version": 1,
    "name": "demo",
    "audio": "",
    "transcript": {"kind": "plain_text", "path": "transcript.txt"},
    "output": {"preset": "draft"},
    "layers": [{"id": "L-bg", "kind": "bg", "name": "Background", "items": []}],
    "subtitles": None,
    "watermark": None,
}


@pytest.mark.asyncio
async def test_load_returns_layers(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text(json.dumps(_BASE))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/load", params={"project": str(tmp_path)})

    assert r.status_code == 200
    data = r.json()
    assert "layers" in data
    assert data["layers"][0]["kind"] == "bg"


@pytest.mark.asyncio
async def test_load_prefers_latest_sqlite_config_snapshot(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    disk_config = dict(_BASE)
    disk_config["name"] = "disk"
    (tmp_path / "project.json").write_text(json.dumps(disk_config))
    sqlite_config = dict(_BASE)
    sqlite_config["name"] = "sqlite"
    save_config_snapshot(tmp_path, sqlite_config)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/load", params={"project": str(tmp_path)})

    assert r.status_code == 200
    assert r.json()["name"] == "sqlite"


@pytest.mark.asyncio
async def test_load_project_not_found(tmp_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/load", params={"project": str(tmp_path / "missing")})

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_media_file_serves_content(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    (media_dir / "photo.jpg").write_bytes(b"\xff\xd8\xff" + b"\x00" * 50)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/projects/media-file",
            params={"project": str(tmp_path), "filename": "photo.jpg"},
        )

    assert r.status_code == 200
    assert "image" in r.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_media_file_not_found(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/projects/media-file",
            params={"project": str(tmp_path), "filename": "ghost.jpg"},
        )

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_media_file_path_traversal_rejected(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/projects/media-file",
            params={"project": str(tmp_path), "filename": "../../../etc/passwd"},
        )

    assert r.status_code == 400
