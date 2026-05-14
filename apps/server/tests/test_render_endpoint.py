from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.db.projects import project_id_for_path, touch_recent
from server.db.renders import insert_render, mark_render_finished
from server.main import app
from server.pipeline import render as render_pipeline
from server.pipeline.render import RenderError, RenderResult
from server.settings import settings


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

    async def fake_start_render_project(*, project_dir: Path, preset: str) -> RenderResult:
        assert project_dir == tmp_path
        assert preset == "draft"
        return RenderResult(
            render_id="r-test",
            output_path=tmp_path / ".vc" / "drafts" / "draft.mp4",
        )

    monkeypatch.setattr(render_pipeline, "start_render_project", fake_start_render_project)

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
async def test_project_id_render_routes(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    touch_recent(tmp_path, "Render")
    project_id = project_id_for_path(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-by-id",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_finished(
        render_id="r-by-id",
        finished_at=datetime_now(),
        duration_s=1.5,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        rows = await client.get(f"/projects/{project_id}/renders")
        item = await client.get(f"/projects/{project_id}/renders/r-by-id")
        delete = await client.delete(f"/projects/{project_id}/renders/r-by-id")

    assert rows.status_code == 200
    assert rows.json()[0]["id"] == "r-by-id"
    assert item.status_code == 200
    assert item.json()["id"] == "r-by-id"
    assert delete.status_code == 200


@pytest.mark.asyncio
async def test_project_id_cancel_render_route(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    touch_recent(tmp_path, "Render")
    project_id = project_id_for_path(tmp_path)
    cancelled: list[str] = []

    async def fake_cancel_render(render_id: str) -> bool:
        cancelled.append(render_id)
        return True

    monkeypatch.setattr(render_pipeline, "cancel_render", fake_cancel_render)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/projects/{project_id}/renders/r-cancel/cancel")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert cancelled == ["r-cancel"]


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
async def test_render_endpoint_rejects_in_progress_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _write_project(tmp_path)

    async def busy_start_render_project(*, project_dir: Path, preset: str) -> RenderResult:
        raise RenderError(409, "RENDER_IN_PROGRESS", "Render already running.")

    monkeypatch.setattr(render_pipeline, "start_render_project", busy_start_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path)},
            json={"preset": "draft"},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RENDER_IN_PROGRESS"


@pytest.mark.asyncio
async def test_list_renders_returns_history(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / ".vc" / "drafts" / "draft.mp4"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-history",
        project_path=tmp_path,
        output_path=output_path,
        preset="draft",
        started_at=datetime_now(),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_finished(
        render_id="r-history",
        finished_at=datetime_now(),
        duration_s=1.5,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/renders", params={"project": str(tmp_path)})

    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["id"] == "r-history"
    assert rows[0]["file_size"] == 3


@pytest.mark.asyncio
async def test_reveal_render_calls_opener(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-open",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    opened: list[Path] = []
    monkeypatch.setattr(render_pipeline, "reveal_in_file_browser", opened.append)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-open/reveal",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 200
    assert opened == [output_path]


@pytest.mark.asyncio
async def test_play_render_calls_default_player(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-play",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_finished(
        render_id="r-play",
        finished_at=datetime_now(),
        duration_s=2.0,
    )
    opened: list[Path] = []
    monkeypatch.setattr(render_pipeline, "open_in_default_player", opened.append)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-play/play",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 200
    assert opened == [output_path]


@pytest.mark.asyncio
async def test_play_partial_render_is_rejected(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / ".vc" / "drafts" / "draft.partial"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"partial")
    insert_render(
        render_id="r-partial",
        project_path=tmp_path,
        output_path=output_path,
        preset="draft",
        started_at=datetime_now(),
        resolution="1280x720",
        width=1280,
        height=720,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-partial/play",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RENDER_NOT_PLAYABLE"


def datetime_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
