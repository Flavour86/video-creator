from pathlib import Path

import httpx
import pytest

import server.runtime_status as runtime_status
from server.db.projects import touch_recent
from server.main import app
from server.settings import settings


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_health_returns_runtime_dependency_status() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()

    assert body["sidecar"] == {
        "status": "ready",
        "address": "http://127.0.0.1:8787",
        "version": "0.1.0",
    }
    assert body["python"]["status"] == "ready"
    assert body["python"]["version"].startswith("3.11")
    assert set(body["ffmpeg"]) == {"status", "version"}
    assert body["ffmpeg"]["status"] in {"ready", "unavailable", "unknown"}
    assert set(body["cuda"]) == {"status", "available", "version", "gpu_label"}
    assert body["cuda"]["status"] in {"ready", "unavailable", "unknown"}
    assert body["cuda"]["available"] in {True, False, None}
    assert set(body["whisperx"]) == {"status", "model"}
    assert body["whisperx"]["status"] in {"ready", "unavailable", "unknown"}
    assert body["whisperx"]["model"] == "large-v3"


@pytest.mark.asyncio
async def test_health_returns_active_render_count(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runtime_status, "active_render_count", lambda: 2, raising=False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["active_renders"] == 2


@pytest.mark.asyncio
async def test_health_returns_cached_project_count(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    cached_project = tmp_path / "cached"
    uncached_project = tmp_path / "uncached"
    cached_project.mkdir()
    uncached_project.mkdir()
    (cached_project / ".vc").mkdir()
    touch_recent(cached_project, "Cached")
    touch_recent(uncached_project, "Uncached")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["cached_projects"] == 1
