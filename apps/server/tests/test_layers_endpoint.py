"""Tests for PUT /projects/layers — written before implementation (TDD)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.db.projects import get_project_by_path
from server.main import app
from server.settings import settings

_BASE_PROJECT = {
    "version": 1,
    "name": "test",
    "audio": "",
    "transcript": {"kind": "plain_text", "path": "transcript.txt"},
    "output": {"preset": "draft"},
    "layers": [],
    "subtitles": None,
    "watermark": None,
}


@pytest.mark.asyncio
async def test_put_layers_saves_to_disk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))
    layers = [
        {
            "id": "L-bg",
            "kind": "bg",
            "name": "Background",
            "items": [
                {
                    "id": "bg-1",
                    "mediaId": "sky.jpg",
                    "sentences": [1, 10],
                    "start": 0.0,
                    "end": 60.0,
                    "motion": {"kind": "none", "easing": "linear"},
                    "transitions": {"in": "cut", "out": "cut"},
                    "crossfade": 0,
                }
            ],
        }
    ]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/layers",
            params={"project": str(tmp_path)},
            json={"layers": layers},
        )

    assert r.status_code == 200
    assert r.json()["layers"][0]["kind"] == "bg"


@pytest.mark.asyncio
async def test_put_layers_saves_canonical_config_snapshot(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))
    layers = [
        {
            "id": "L-bg",
            "kind": "bg",
            "name": "Background",
            "items": [],
        }
    ]

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/layers",
            params={"project": str(tmp_path)},
            json={"layers": layers},
        )

    assert r.status_code == 200
    row = get_project_by_path(tmp_path)
    assert row is not None
    assert str(row["current_config_hash"]).startswith("sha256:")
    assert row["has_unrendered_changes"] == 1


@pytest.mark.asyncio
async def test_put_layers_rejects_invalid_config_without_writing(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/layers",
            params={"project": str(tmp_path)},
            json={"layers": [{"id": "bad", "kind": "fg", "name": "Bad", "items": [{}]}]},
        )

    assert r.status_code == 422
    row = get_project_by_path(tmp_path)
    assert row is None or row.get("current_config_hash") is None


@pytest.mark.asyncio
async def test_put_layers_returns_saved_layers(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/layers",
            params={"project": str(tmp_path)},
            json={"layers": []},
        )

    assert r.status_code == 200
    assert r.json()["layers"] == []


@pytest.mark.asyncio
async def test_put_layers_project_not_found(tmp_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/layers",
            params={"project": str(tmp_path / "nonexistent")},
            json={"layers": []},
        )

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_subtitles_saves_burn_in_setting(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/subtitles",
            params={"project": str(tmp_path)},
            json={"burn_in": True},
        )

    assert r.status_code == 200
    assert r.json()["subtitles"]["burn_in"] is True
    assert r.json()["subtitles"]["style"]["font"] == "Arial"


@pytest.mark.asyncio
async def test_put_subtitles_project_not_found(tmp_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/subtitles",
            params={"project": str(tmp_path / "nonexistent")},
            json={"burn_in": True},
        )

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_put_watermark_saves_setting(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/watermark",
            params={"project": str(tmp_path)},
            json={
                "mediaId": "logo.png",
                "posX": 100,
                "posY": 100,
                "scale": 0.08,
                "opacity": 60,
            },
        )

    assert r.status_code == 200
    assert r.json()["watermark"]["mediaId"] == "logo.png"
    assert r.json()["watermark"]["opacity"] == 60


@pytest.mark.asyncio
async def test_put_watermark_clears_setting(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project = dict(_BASE_PROJECT)
    project["watermark"] = {
        "mediaId": "logo.png",
        "posX": 100,
        "posY": 100,
        "scale": 0.08,
        "opacity": 60,
    }
    (tmp_path / "project.json").write_text(json.dumps(project))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/watermark",
            params={"project": str(tmp_path)},
            json={"mediaId": None},
        )

    assert r.status_code == 200
    assert r.json()["watermark"] is None
