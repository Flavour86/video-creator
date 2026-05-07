from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from server.main import app
from server.pipeline import render as render_pipeline
from server.pipeline.render import RenderResult


def _write_project(project_dir: Path) -> None:
    project_dir.mkdir(exist_ok=True)
    (project_dir / "project.json").write_text(
        json.dumps(
            {
                "version": 1,
                "name": "test",
                "audio": "voice.wav",
                "transcript": {"kind": "plain_text", "path": "transcript.txt"},
                "output": {"preset": "draft"},
                "layers": [],
                "subtitles": None,
                "watermark": None,
            }
        ),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_render_endpoint_returns_render_result(monkeypatch, tmp_path: Path) -> None:
    _write_project(tmp_path)

    async def fake_render_project(*, project_dir: Path, preset: str) -> RenderResult:
        assert project_dir == tmp_path
        assert preset == "draft"
        return RenderResult(
            render_id="r-test",
            output_path=tmp_path / ".vc" / "drafts" / "draft.mp4",
        )

    monkeypatch.setattr(render_pipeline, "render_project", fake_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path)},
            json={"preset": "draft"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "render_id": "r-test",
        "output_path": str(tmp_path / ".vc" / "drafts" / "draft.mp4"),
    }


@pytest.mark.asyncio
async def test_render_endpoint_project_not_found(tmp_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path / "missing")},
            json={"preset": "draft"},
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"


@pytest.mark.asyncio
async def test_render_endpoint_rejects_concurrent_project_render(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _write_project(tmp_path)
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow_render_project(*, project_dir: Path, preset: str) -> RenderResult:
        started.set()
        await release.wait()
        return RenderResult(
            render_id="r-slow",
            output_path=project_dir / ".vc" / "drafts" / "draft.mp4",
        )

    monkeypatch.setattr(render_pipeline, "render_project", slow_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = asyncio.create_task(
            client.post(
                "/projects/render",
                params={"project": str(tmp_path)},
                json={"preset": "draft"},
            )
        )
        await started.wait()
        second = await client.post(
            "/projects/render",
            params={"project": str(tmp_path)},
            json={"preset": "draft"},
        )
        release.set()
        first_response = await first

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "RENDER_IN_PROGRESS"
    assert first_response.status_code == 200
