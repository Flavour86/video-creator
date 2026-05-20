from __future__ import annotations

import asyncio
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.db.projects import project_id_for_path
from server.db.renders import insert_render, list_render_events
from server.main import app
from server.pipeline.render_progress import (
    _latest,
    RenderProgressEvent,
    publish_progress,
    subscribe_progress,
)
from server.settings import settings


def _seed_render(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, render_id: str) -> str:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    output_path = project_dir / "renders" / f"{render_id}.mp4"
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=output_path,
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    return project_id_for_path(project_dir)


@pytest.mark.asyncio
async def test_subscriber_receives_published_progress_event(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-progress"
    project_id = _seed_render(monkeypatch, tmp_path, render_id)
    events = subscribe_progress(render_id, project_id=project_id)
    next_event = asyncio.create_task(events.__anext__())

    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="compose",
            percent=42.0,
            eta_seconds=12,
            current_frame=120,
            speed="1.2x",
            message=None,
        )
    )

    event = await next_event
    await events.aclose()
    assert event.render_id == render_id
    assert event.stage == "compose"
    assert event.percent == 42.0


@pytest.mark.asyncio
async def test_late_subscriber_receives_latest_event(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-late"
    project_id = _seed_render(monkeypatch, tmp_path, render_id)
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="cache_warm",
            percent=5.0,
        )
    )

    events = subscribe_progress(render_id, project_id=project_id)
    event = await events.__anext__()
    await events.aclose()
    assert event.stage == "cache_warm"
    assert event.percent == 5.0


@pytest.mark.asyncio
async def test_progress_persists_queued_and_stage_messages(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-stages"
    _seed_render(monkeypatch, tmp_path, render_id)
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="cache_warm",
            percent=0.0,
            message="queued",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="cache_warm",
            percent=1.0,
            message="verifying cache",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="cache_warm",
            percent=4.0,
            message="building subtitles.srt",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="compose",
            percent=12.0,
            message="ffmpeg compose",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="muxing",
            percent=98.0,
            message="muxing audio",
        )
    )

    phases = [str(row["phase"]) for row in list_render_events(render_id)]
    messages = [str(row["message"]) for row in list_render_events(render_id)]
    assert phases == ["cache_warm", "cache_warm", "cache_warm", "compose", "muxing"]
    assert messages == [
        "queued",
        "verifying cache",
        "building subtitles.srt",
        "ffmpeg compose",
        "muxing audio",
    ]


@pytest.mark.asyncio
async def test_subscriber_recovers_latest_event_from_db(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-recover"
    project_id = _seed_render(monkeypatch, tmp_path, render_id)
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="compose",
            percent=55.0,
            eta_seconds=9,
            current_frame=320,
            speed="1.4x",
            message="ffmpeg compose",
            output_path="E:/demo/renders/out.mp4",
        )
    )
    _latest.pop(render_id, None)

    events = subscribe_progress(render_id, project_id=project_id)
    event = await events.__anext__()
    await events.aclose()
    assert event.stage == "compose"
    assert event.percent == 55.0
    assert event.eta_seconds == 9
    assert event.current_frame == 320
    assert event.speed == "1.4x"
    assert event.output_path == "E:/demo/renders/out.mp4"


@pytest.mark.asyncio
async def test_subscriber_does_not_receive_other_project_render_events(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    project_a = tmp_path / "project-a"
    project_b = tmp_path / "project-b"
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    insert_render(
        render_id="r-a",
        project_path=project_a,
        output_path=project_a / "renders" / "a.mp4",
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    insert_render(
        render_id="r-b",
        project_path=project_b,
        output_path=project_b / "renders" / "b.mp4",
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 1, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    events = subscribe_progress("r-a", project_id=project_id_for_path(project_a))
    wait_for_event = asyncio.create_task(events.__anext__())
    await publish_progress(RenderProgressEvent(render_id="r-b", stage="compose", percent=10.0))
    await asyncio.sleep(0.05)
    assert not wait_for_event.done()
    wait_for_event.cancel()
    with suppress(asyncio.CancelledError):
        await wait_for_event
    await events.aclose()


def test_ws_requires_project_id(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _seed_render(monkeypatch, tmp_path, "r-no-project")
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws?render_id=r-no-project"):
                pass


def test_ws_rejects_mismatched_project_id(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    project_id = _seed_render(monkeypatch, tmp_path, "r-mismatch")
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                f"/ws?render_id=r-mismatch&project_id={project_id}-other"
            ):
                pass


def test_compat_ws_derives_project_id(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    render_id = "r-compat"
    _seed_render(monkeypatch, tmp_path, render_id)
    asyncio.run(
        publish_progress(
            RenderProgressEvent(
                render_id=render_id,
                stage="compose",
                percent=64.0,
                message="compat",
            )
        )
    )
    with TestClient(app) as client:
        with client.websocket_connect(f"/projects/render/ws?render_id={render_id}") as websocket:
            payload = websocket.receive_json()
    assert payload["render_id"] == render_id
    assert payload["stage"] == "compose"
    assert payload["percent"] == 64.0
