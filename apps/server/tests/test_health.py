from pathlib import Path

import httpx
import pytest

import server.runtime_status as runtime_status
from server.db.app_db import AppDatabaseError
from server.db.projects import touch_recent
from server.domain.project import CudaStatus, VersionedRuntimeStatus, WhisperXStatus
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
    assert set(body["node"]) == {"status", "version"}
    assert body["node"]["status"] in {"ready", "unavailable", "unknown"}
    assert set(body["ffmpeg"]) == {"status", "version"}
    assert body["ffmpeg"]["status"] in {"ready", "unavailable", "unknown"}
    assert set(body["cuda"]) == {"status", "available", "version", "gpu_label"}
    assert body["cuda"]["status"] in {"ready", "unavailable", "unknown"}
    assert body["cuda"]["available"] in {True, False, None}
    assert set(body["whisperx"]) == {"status", "model"}
    assert body["whisperx"]["status"] in {"ready", "unavailable", "unknown"}
    assert body["whisperx"]["model"] == "large-v3"


@pytest.mark.asyncio
async def test_health_returns_stable_json_when_runtime_dependencies_are_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(runtime_status, "active_render_count", lambda: 0, raising=False)
    monkeypatch.setattr(runtime_status, "count_cached_projects", lambda: 3, raising=False)
    monkeypatch.setattr(
        runtime_status,
        "_detect_ffmpeg_status",
        lambda: VersionedRuntimeStatus(status="unavailable", version="unknown"),
    )
    monkeypatch.setattr(
        runtime_status,
        "_detect_node_status",
        lambda: VersionedRuntimeStatus(status="unavailable", version="unknown"),
    )
    monkeypatch.setattr(
        runtime_status,
        "_detect_cuda_status",
        lambda: CudaStatus(
            status="unavailable",
            available=False,
            version="unknown",
            gpu_label=None,
        ),
    )
    monkeypatch.setattr(
        runtime_status,
        "_detect_whisperx_status",
        lambda model: WhisperXStatus(status="unavailable", model=model),
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["python"]["version"].startswith("3.11")
    assert body == {
        "status": "ok",
        "version": "0.1.0",
        "active_renders": 0,
        "cached_projects": 3,
        "sidecar": {
            "status": "ready",
            "address": "http://127.0.0.1:8787",
            "version": "0.1.0",
        },
        "python": {
            "status": "ready",
            "version": body["python"]["version"],
        },
        "node": {"status": "unavailable", "version": "unknown"},
        "ffmpeg": {"status": "unavailable", "version": "unknown"},
        "cuda": {
            "status": "unavailable",
            "available": False,
            "version": "unknown",
            "gpu_label": None,
        },
        "whisperx": {"status": "unavailable", "model": "large-v3"},
    }


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


@pytest.mark.asyncio
async def test_health_hides_raw_app_db_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise_db_error() -> int:
        raise AppDatabaseError("Migration 5 checksum mismatch: database disk image is malformed")

    monkeypatch.setattr(runtime_status, "count_cached_projects", _raise_db_error, raising=False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "APP_DB_UNAVAILABLE"
    assert "checksum mismatch" not in body["error"]["message"].lower()
    assert "malformed" not in body["error"]["message"].lower()
