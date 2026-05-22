from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.db.projects import project_id_for_path
from server.db.renders import get_render, insert_render, list_render_events, list_renders_for_project
from server.domain.project import Project
from server.domain.timing import AlignedSentence, AlignmentResult
from server.main import app
from server.pipeline import render as render_pipeline
from server.pipeline.render_progress import (
    _latest,
    RenderProgressEvent,
    publish_progress,
    subscribe_progress,
)
from server.settings import settings


def _write_project(project_dir: Path) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "name": "test",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": {"preset": "draft"},
        "layers": [],
        "subtitles": None,
        "watermark": None,
    }
    (project_dir / "project.json").write_text(json.dumps(payload), encoding="utf-8")


async def _wait_for(condition: object) -> None:
    for _ in range(50):
        if callable(condition) and condition():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Timed out waiting for render condition.")


def _clear_render_runtime() -> None:
    render_pipeline._active_projects.clear()
    render_pipeline._active_tasks.clear()
    render_pipeline._active_jobs.clear()
    render_pipeline._project_queues.clear()
    render_pipeline._queued_jobs.clear()


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
async def test_start_render_project_queues_second_render_for_same_project(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    _clear_render_runtime()
    ids = iter(["r-queue-1", "r-queue-2"])
    first_started = asyncio.Event()
    second_started = asyncio.Event()
    release_first = asyncio.Event()
    release_second = asyncio.Event()
    started: list[str] = []

    async def fake_run_job(job: render_pipeline.RenderJob, *, raise_errors: bool) -> None:
        started.append(job.render_id)
        if job.render_id == "r-queue-1":
            first_started.set()
            await release_first.wait()
        else:
            second_started.set()
            await release_second.wait()

    monkeypatch.setattr(render_pipeline, "_new_render_id", lambda: next(ids))
    monkeypatch.setattr(render_pipeline, "_run_job", fake_run_job)

    try:
        first = await render_pipeline.start_render_project(project_dir=project_dir, preset="draft")
        await asyncio.wait_for(first_started.wait(), timeout=1)
        second = await render_pipeline.start_render_project(project_dir=project_dir, preset="final")

        assert first.render_id == "r-queue-1"
        assert second.render_id == "r-queue-2"
        assert get_render("r-queue-1")["status"] == "rendering"
        assert get_render("r-queue-2")["status"] == "queued"
        assert [row["id"] for row in list_renders_for_project(project_dir)] == [
            "r-queue-1",
            "r-queue-2",
        ]
        assert [row["phase"] for row in list_render_events("r-queue-2")] == ["queued"]
        assert render_pipeline.active_render_count() == 1

        release_first.set()
        await asyncio.wait_for(second_started.wait(), timeout=1)
        assert started == ["r-queue-1", "r-queue-2"]
        assert get_render("r-queue-2")["status"] == "rendering"

        release_second.set()
        await _wait_for(lambda: render_pipeline.active_render_count() == 0)
    finally:
        release_first.set()
        release_second.set()
        await asyncio.sleep(0)
        _clear_render_runtime()


@pytest.mark.asyncio
async def test_cancel_render_removes_queued_job_without_starting_it(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    _clear_render_runtime()
    ids = iter(["r-active", "r-queued"])
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    started: list[str] = []

    async def fake_run_job(job: render_pipeline.RenderJob, *, raise_errors: bool) -> None:
        started.append(job.render_id)
        first_started.set()
        await release_first.wait()

    monkeypatch.setattr(render_pipeline, "_new_render_id", lambda: next(ids))
    monkeypatch.setattr(render_pipeline, "_run_job", fake_run_job)

    try:
        await render_pipeline.start_render_project(project_dir=project_dir, preset="draft")
        await asyncio.wait_for(first_started.wait(), timeout=1)
        queued = await render_pipeline.start_render_project(project_dir=project_dir, preset="final")

        assert await render_pipeline.cancel_render(queued.render_id) is True
        assert get_render("r-queued")["status"] == "cancelled"
        assert [row["phase"] for row in list_render_events("r-queued")] == ["queued", "cancelled"]

        release_first.set()
        await _wait_for(lambda: render_pipeline.active_render_count() == 0)
        assert started == ["r-active"]
    finally:
        release_first.set()
        await asyncio.sleep(0)
        _clear_render_runtime()


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
            stage="queued",
            percent=0.0,
            message="queued",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="verify_alignment_cache",
            percent=1.0,
            message="verifying cache",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="pre_render_cached_clips",
            percent=9.0,
            message="pre-rendering clips",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="build_subtitles_srt",
            percent=10.0,
            message="building subtitles.srt",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="compose_filtergraph",
            percent=12.0,
            message="ffmpeg compose",
        )
    )
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="mux_mp4_faststart",
            percent=98.0,
            message="muxing audio",
        )
    )

    phases = [str(row["phase"]) for row in list_render_events(render_id)]
    messages = [str(row["message"]) for row in list_render_events(render_id)]
    assert phases == [
        "queued",
        "verify_alignment_cache",
        "pre_render_cached_clips",
        "build_subtitles_srt",
        "compose_filtergraph",
        "mux_mp4_faststart",
    ]
    assert messages == [
        "queued",
        "verifying cache",
        "pre-rendering clips",
        "building subtitles.srt",
        "ffmpeg compose",
        "muxing audio",
    ]


@pytest.mark.asyncio
async def test_runtime_emits_progress_messages_in_spec_order(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    events: list[tuple[str, float, str | None]] = []

    async def fake_publish_progress(event: RenderProgressEvent) -> None:
        events.append((event.stage, event.percent, event.message))

    async def fake_ensure_alignment(project_dir: Path, project: Project) -> AlignmentResult:
        return AlignmentResult(
            sentences=[
                AlignedSentence(
                    index=1,
                    text="One sentence.",
                    start_s=0.0,
                    end_s=1.0,
                    confidence_avg=1.0,
                )
            ],
            words=[],
            cache_hit=True,
        )

    async def fake_run_ffmpeg(
        command: list[str],
        output_path: Path,
        *,
        render_id: str,
        total_s: float,
    ) -> render_pipeline._RenderMediaStats:
        return render_pipeline._RenderMediaStats()

    monkeypatch.setattr(render_pipeline, "publish_progress", fake_publish_progress)
    monkeypatch.setattr(render_pipeline, "_ensure_alignment", fake_ensure_alignment)
    monkeypatch.setattr(
        render_pipeline,
        "build_compose_command",
        lambda **kwargs: ["ffmpeg", "-y", "mock.mp4"],
    )
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)
    monkeypatch.setattr(render_pipeline, "mark_render_finished", lambda **kwargs: None)

    project_dir = tmp_path / "project"
    project = Project.model_validate(
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
    )
    job = render_pipeline.RenderJob(
        render_id="r-runtime-order",
        project_dir=project_dir,
        project=project,
        preset="draft",
        resolution="1280x720",
        output_path=project_dir / ".vc" / "drafts" / "r-runtime-order.mp4",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
    )

    await render_pipeline._run_job(job, raise_errors=True)

    assert [message for _, _, message in events] == [
        "queued",
        "verifying cache",
        "pre-rendering clips",
        "building subtitles.srt",
        "ffmpeg compose",
        "muxing audio",
        "appending render history",
        "Draft ready",
    ]
    assert [stage for stage, _, _ in events] == [
        "queued",
        "verify_alignment_cache",
        "pre_render_cached_clips",
        "build_subtitles_srt",
        "compose_filtergraph",
        "mux_mp4_faststart",
        "append_render_history_to_app_db",
        "done",
    ]
    assert [percent for _, percent, _ in events] == [0.0, 1.0, 9.0, 10.0, 12.0, 98.0, 99.0, 100.0]
    percents = [percent for _, percent, _ in events]
    assert percents == sorted(percents)


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
    assert event.stage == "compose_filtergraph"
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
