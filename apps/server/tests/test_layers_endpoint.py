"""Tests for PUT /projects/layers — written before implementation (TDD)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.main import app

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
async def test_put_layers_saves_to_disk(tmp_path: Path) -> None:
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
    saved = json.loads((tmp_path / "project.json").read_text())
    assert len(saved["layers"]) == 1
    assert saved["layers"][0]["kind"] == "bg"


@pytest.mark.asyncio
async def test_put_layers_returns_saved_layers(tmp_path: Path) -> None:
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
async def test_put_subtitles_saves_burn_in_setting(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text(json.dumps(_BASE_PROJECT))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.put(
            "/projects/subtitles",
            params={"project": str(tmp_path)},
            json={"burn_in": True},
        )

    assert r.status_code == 200
    saved = json.loads((tmp_path / "project.json").read_text(encoding="utf-8"))
    assert saved["subtitles"]["burn_in"] is True
    assert saved["subtitles"]["style"]["font"] == "Arial"


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
