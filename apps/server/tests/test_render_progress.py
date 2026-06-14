from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from collections import deque
from contextlib import suppress
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.db.projects import project_id_for_path
from server.db.renders import (
    get_render,
    insert_render,
    list_render_artifacts,
    list_render_events,
    list_renders_for_project,
    mark_render_started,
)
from server.domain.project import Project
from server.domain.timing import AlignedSentence, AlignmentResult
from server.main import app
from server.pipeline import render as render_pipeline
from server.pipeline.render_progress import (
    _latest,
    _subscribers,
    RenderLogEvent,
    RenderProgressEvent,
    publish_log,
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


async def _fake_alignment(project_dir: Path, project: Project) -> AlignmentResult:
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


async def _noop_warm_clip_cache(**kwargs: object) -> None:
    return None


def _render_job(project_dir: Path, render_id: str) -> render_pipeline.RenderJob:
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
    return render_pipeline.RenderJob(
        render_id=render_id,
        project_dir=project_dir,
        project=project,
        preset="draft",
        resolution="1280x720",
        output_path=project_dir / ".vc" / "drafts" / f"{render_id}.mp4",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
    )


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
async def test_cancel_active_render_emits_cancelling_before_task_cancel(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    _clear_render_runtime()
    monkeypatch.setattr(render_pipeline, "_new_render_id", lambda: "r-active-cancel")
    started = asyncio.Event()
    release = asyncio.Event()

    async def fake_run_job(job: render_pipeline.RenderJob, *, raise_errors: bool) -> None:
        started.set()
        await release.wait()

    monkeypatch.setattr(render_pipeline, "_run_job", fake_run_job)

    try:
        result = await render_pipeline.start_render_project(project_dir=project_dir, preset="draft")
        await asyncio.wait_for(started.wait(), timeout=1)

        assert await render_pipeline.cancel_render(result.render_id) is True

        assert list_render_events(result.render_id)[-1]["phase"] == "cancelling"
    finally:
        release.set()
        await asyncio.sleep(0)
        _clear_render_runtime()


@pytest.mark.asyncio
async def test_active_render_cancel_preserves_partial_and_records_cancelled(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    insert_render(
        render_id="r-active-partial",
        project_path=project_dir,
        output_path=project_dir / ".vc" / "drafts" / "r-active-partial.mp4",
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_started(render_id="r-active-partial")
    wrote_partial = asyncio.Event()
    release = asyncio.Event()

    async def fake_run_ffmpeg(
        command: list[str],
        output_path: Path,
        *,
        render_id: str,
        total_s: float,
        log_path: Path | None = None,
    ) -> render_pipeline._RenderMediaStats:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"partial")
        wrote_partial.set()
        await release.wait()
        return render_pipeline._RenderMediaStats()

    monkeypatch.setattr(render_pipeline, "_ensure_alignment", _fake_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", _noop_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", lambda **kwargs: ["ffmpeg"])
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)
    job = _render_job(project_dir, "r-active-partial")
    task = asyncio.create_task(render_pipeline._run_job(job, raise_errors=False))
    await asyncio.wait_for(wrote_partial.wait(), timeout=1)

    task.cancel()
    await task

    partial_path = job.output_path.with_name(f"{job.output_path.name}.partial")
    assert partial_path.read_bytes() == b"partial"
    assert get_render("r-active-partial")["status"] == "cancelled"
    assert list_render_artifacts("r-active-partial")[0]["kind"] == "partial"
    assert list_render_events("r-active-partial")[-1]["phase"] == "cancelled"


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
async def test_publish_log_persists_warning_and_fatal_events(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-log-events"
    _seed_render(monkeypatch, tmp_path, render_id)

    await publish_log(RenderLogEvent(render_id=render_id, line="warning: clipped samples"))
    await publish_log(RenderLogEvent(render_id=render_id, line="fatal error: encoder failed"))

    rows = list_render_events(render_id)
    assert [row["phase"] for row in rows] == ["ffmpeg_warning", "ffmpeg_fatal_error"]
    assert [row["message"] for row in rows] == [
        "warning: clipped samples",
        "fatal error: encoder failed",
    ]


def test_persist_render_log_artifact_records_reopenable_log(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    render_id = "r-log-artifact"
    _seed_render(monkeypatch, tmp_path, render_id)
    log_path = tmp_path / "project" / ".vc" / "logs" / "r-log-artifact.log"
    log_path.parent.mkdir(parents=True)
    log_path.write_text("line one\n", encoding="utf-8")

    render_pipeline._persist_render_log_artifact(render_id, log_path)

    artifacts = list_render_artifacts(render_id)
    assert artifacts[0]["kind"] == "log"
    assert artifacts[0]["path"] == str(log_path.resolve())
    assert artifacts[0]["size_bytes"] == log_path.stat().st_size


def test_probe_output_metadata_reads_ffprobe_json(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    output_path = tmp_path / "out.mp4"
    output_path.write_bytes(
        b"\x00\x00\x00\x08ftyp" b"\x00\x00\x00\x08moov" b"\x00\x00\x00\x08mdat"
    )
    payload = {
        "format": {
            "duration": "12.5",
            "bit_rate": "1500000",
        },
        "streams": [
            {
                "codec_type": "video",
                "codec_name": "h264",
                "width": 1080,
                "height": 1920,
                "avg_frame_rate": "30000/1001",
            },
            {
                "codec_type": "audio",
                "codec_name": "aac",
                "bit_rate": "192000",
                "sample_rate": "48000",
            },
        ],
    }

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(args=args, returncode=0, stdout=json.dumps(payload), stderr="")

    monkeypatch.setattr(render_pipeline.subprocess, "run", fake_run)

    metadata = render_pipeline._probe_output_metadata(output_path)

    assert metadata.duration_s == 12.5
    assert metadata.width == 1080
    assert metadata.height == 1920
    assert metadata.fps == pytest.approx(29.97, rel=0.001)
    assert metadata.video_codec == "h264"
    assert metadata.audio_codec == "aac"
    assert metadata.audio_bitrate_kbps == 192
    assert metadata.audio_sample_rate == 48000
    assert metadata.faststart is True


@pytest.mark.asyncio
async def test_ffmpeg_failure_records_failed_event(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    insert_render(
        render_id="r-ffmpeg-failed",
        project_path=project_dir,
        output_path=project_dir / ".vc" / "drafts" / "r-ffmpeg-failed.mp4",
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_started(render_id="r-ffmpeg-failed")

    async def fake_run_ffmpeg(*args: object, **kwargs: object) -> render_pipeline._RenderMediaStats:
        raise render_pipeline.RenderError(500, "FFMPEG_FAILED", "ffmpeg failed")

    monkeypatch.setattr(render_pipeline, "_ensure_alignment", _fake_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", _noop_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", lambda **kwargs: ["ffmpeg"])
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)

    await render_pipeline._run_job(_render_job(project_dir, "r-ffmpeg-failed"), raise_errors=False)

    assert get_render("r-ffmpeg-failed")["status"] == "failed"
    assert list_render_events("r-ffmpeg-failed")[-1]["phase"] == "failed"


@pytest.mark.asyncio
async def test_history_write_failure_emits_recoverable_failed_event(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    insert_render(
        render_id="r-history-failed",
        project_path=project_dir,
        output_path=project_dir / ".vc" / "drafts" / "r-history-failed.mp4",
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_started(render_id="r-history-failed")

    async def fake_run_ffmpeg(
        command: list[str],
        output_path: Path,
        *,
        render_id: str,
        total_s: float,
        log_path: Path | None = None,
    ) -> render_pipeline._RenderMediaStats:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"mp4")
        return render_pipeline._RenderMediaStats(duration_s=1.0)

    def fail_mark_render_finished(**kwargs: object) -> None:
        raise RuntimeError("db unavailable")

    monkeypatch.setattr(render_pipeline, "_ensure_alignment", _fake_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", _noop_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", lambda **kwargs: ["ffmpeg"])
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)
    monkeypatch.setattr(render_pipeline, "mark_render_finished", fail_mark_render_finished)

    await render_pipeline._run_job(_render_job(project_dir, "r-history-failed"), raise_errors=False)

    assert (project_dir / ".vc" / "drafts" / "r-history-failed.mp4").is_file()
    assert list_render_events("r-history-failed")[-1]["phase"] == "failed"
    assert "history update failed" in str(list_render_events("r-history-failed")[-1]["message"])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("render_id", "failure"),
    [
        (
            "r-render-failure",
            render_pipeline.RenderError(500, "RENDER_FAILED", "render failure"),
        ),
        (
            "r-disk-full",
            render_pipeline.RenderError(507, "DISK_FULL", "disk full while writing output"),
        ),
        (
            "r-drive-disconnected",
            OSError("drive disconnected during render"),
        ),
    ],
)
async def test_recoverable_render_failures_record_failed_rows_and_cleanup_partials(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    render_id: str,
    failure: Exception,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    output_path = project_dir / ".vc" / "drafts" / f"{render_id}.mp4"
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=output_path,
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_started(render_id=render_id)

    async def fake_run_ffmpeg(*args: object, **kwargs: object) -> render_pipeline._RenderMediaStats:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"partial")
        raise failure

    monkeypatch.setattr(render_pipeline, "_ensure_alignment", _fake_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", _noop_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", lambda **kwargs: ["ffmpeg"])
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)

    await render_pipeline._run_job(_render_job(project_dir, render_id), raise_errors=False)

    row = get_render(render_id)
    assert row["status"] == "failed"
    assert not output_path.exists()
    assert list_render_events(render_id)[-1]["phase"] == "failed"


@pytest.mark.asyncio
async def test_successful_render_after_failure_requires_no_manual_cleanup(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    for render_id in ("r-first-fails", "r-next-succeeds"):
        insert_render(
            render_id=render_id,
            project_path=project_dir,
            output_path=project_dir / ".vc" / "drafts" / f"{render_id}.mp4",
            preset="draft",
            started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
            resolution="1280x720",
            width=1280,
            height=720,
        )
        mark_render_started(render_id=render_id)

    async def fake_run_ffmpeg(
        command: list[str],
        output_path: Path,
        *,
        render_id: str,
        total_s: float,
        log_path: Path | None = None,
    ) -> render_pipeline._RenderMediaStats:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if render_id == "r-first-fails":
            output_path.write_bytes(b"partial")
            raise render_pipeline.RenderError(500, "FFMPEG_FAILED", "ffmpeg failed")
        output_path.write_bytes(b"mp4")
        return render_pipeline._RenderMediaStats(duration_s=1.0)

    monkeypatch.setattr(render_pipeline, "_ensure_alignment", _fake_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", _noop_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", lambda **kwargs: ["ffmpeg"])
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)

    await render_pipeline._run_job(_render_job(project_dir, "r-first-fails"), raise_errors=False)
    await render_pipeline._run_job(_render_job(project_dir, "r-next-succeeds"), raise_errors=False)

    assert get_render("r-first-fails")["status"] == "failed"
    assert get_render("r-next-succeeds")["status"] == "rendered"
    assert (project_dir / ".vc" / "drafts" / "r-next-succeeds.mp4").is_file()


@pytest.mark.asyncio
async def test_sidecar_task_death_clears_active_render_and_starts_next_queue(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(project_dir)
    active_job = _render_job(project_dir, "r-sidecar-dead")
    queued_job = _render_job(project_dir, "r-after-sidecar")
    for job in (active_job, queued_job):
        insert_render(
            render_id=job.render_id,
            project_path=project_dir,
            output_path=job.output_path,
            preset=job.preset,
            started_at=job.started_at,
            resolution=job.resolution,
            width=1280,
            height=720,
        )
    project_key = str(project_dir.resolve())
    render_pipeline._active_projects[project_key] = active_job.render_id
    render_pipeline._active_jobs[active_job.render_id] = active_job
    render_pipeline._project_queues[project_key] = deque([queued_job])
    render_pipeline._queued_jobs[queued_job.render_id] = queued_job

    async def failed_sidecar() -> None:
        raise RuntimeError("sidecar died")

    failed_task = asyncio.create_task(failed_sidecar())
    with suppress(RuntimeError):
        await failed_task
    render_pipeline._active_tasks[active_job.render_id] = failed_task

    started = asyncio.Event()
    block_next = asyncio.Event()

    async def fake_run_job(job: render_pipeline.RenderJob, *, raise_errors: bool) -> None:
        started.set()
        await block_next.wait()

    monkeypatch.setattr(render_pipeline, "_run_job", fake_run_job)

    render_pipeline._handle_task_done(active_job, failed_task)
    await _wait_for(started.is_set)

    assert active_job.render_id not in render_pipeline._active_jobs
    assert render_pipeline._active_projects[project_key] == queued_job.render_id
    assert get_render(queued_job.render_id)["status"] == "rendering"

    next_task = render_pipeline._active_tasks[queued_job.render_id]
    next_task.cancel()
    with suppress(asyncio.CancelledError):
        await next_task
    _clear_render_runtime()


@pytest.mark.asyncio
async def test_browser_disconnect_unregisters_render_progress_subscriber() -> None:
    _subscribers.clear()

    async def consume() -> None:
        async for _event in subscribe_progress("r-browser-close", project_id="p-browser"):
            pass

    task = asyncio.create_task(consume())
    await _wait_for(lambda: ("p-browser", "r-browser-close") in _subscribers)
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task

    assert ("p-browser", "r-browser-close") not in _subscribers


@pytest.mark.asyncio
async def test_large_render_log_retains_tail_and_writes_full_log(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    render_id = "r-large-log"
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=project_dir / ".vc" / "drafts" / f"{render_id}.mp4",
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    stream = asyncio.StreamReader()
    for index in range(250):
        stream.feed_data(f"warning line {index}\n".encode("utf-8"))
    stream.feed_eof()
    sink: list[str] = []
    log_path = project_dir / ".vc" / "logs" / f"{render_id}.log"

    await render_pipeline._relay_stderr(stream, render_id, sink, log_path=log_path)

    assert len(sink) == 200
    assert sink[0] == "warning line 50"
    assert sink[-1] == "warning line 249"
    assert len(log_path.read_text(encoding="utf-8").splitlines()) == 250


@pytest.mark.asyncio
async def test_ffmpeg_nonzero_exit_uses_stderr_tail_and_persists_log_artifact(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    render_id = "r-ffmpeg-nonzero"
    output_path = project_dir / ".vc" / "drafts" / f"{render_id}.mp4"
    log_path = project_dir / ".vc" / "logs" / f"{render_id}.log"
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=output_path,
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )

    command = [
        sys.executable,
        "-c",
        "import sys\nfor i in range(25): print(f'ffmpeg error {i}', file=sys.stderr)\nsys.exit(2)",
    ]
    with pytest.raises(render_pipeline.RenderError) as exc_info:
        await render_pipeline._run_ffmpeg(command, output_path, render_id=render_id, total_s=1.0, log_path=log_path)

    assert exc_info.value.code == "FFMPEG_FAILED"
    assert "ffmpeg error 24" in exc_info.value.message
    assert "ffmpeg error 0" not in exc_info.value.message
    assert list_render_artifacts(render_id)[0]["path"] == str(log_path)


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
        log_path: Path | None = None,
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
async def test_draft_runtime_limits_compose_and_progress_to_first_minute(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    captured: dict[str, object] = {}

    async def fake_publish_progress(event: RenderProgressEvent) -> None:
        return None

    async def fake_ensure_alignment(project_dir: Path, project: Project) -> AlignmentResult:
        return AlignmentResult(
            sentences=[
                AlignedSentence(
                    index=1,
                    text="Long sentence.",
                    start_s=0.0,
                    end_s=300.0,
                    confidence_avg=1.0,
                )
            ],
            words=[],
            cache_hit=True,
        )

    async def fake_warm_clip_cache(**kwargs: object) -> None:
        captured["warm_duration_limit_s"] = kwargs.get("duration_limit_s")

    def fake_build_compose_command(**kwargs: object) -> list[str]:
        captured["compose_duration_limit_s"] = kwargs.get("duration_limit_s")
        return ["ffmpeg", "-y", "mock.mp4"]

    async def fake_run_ffmpeg(
        command: list[str],
        output_path: Path,
        *,
        render_id: str,
        total_s: float,
        log_path: Path | None = None,
    ) -> render_pipeline._RenderMediaStats:
        captured["progress_total_s"] = total_s
        return render_pipeline._RenderMediaStats()

    monkeypatch.setattr(render_pipeline, "publish_progress", fake_publish_progress)
    monkeypatch.setattr(render_pipeline, "_ensure_alignment", fake_ensure_alignment)
    monkeypatch.setattr(render_pipeline, "_warm_clip_cache", fake_warm_clip_cache)
    monkeypatch.setattr(render_pipeline, "build_compose_command", fake_build_compose_command)
    monkeypatch.setattr(render_pipeline, "_run_ffmpeg", fake_run_ffmpeg)
    monkeypatch.setattr(render_pipeline, "mark_render_finished", lambda **kwargs: None)

    await render_pipeline._run_job(_render_job(tmp_path / "project", "r-draft-limit"), raise_errors=True)

    assert captured == {
        "warm_duration_limit_s": 60.0,
        "compose_duration_limit_s": 60.0,
        "progress_total_s": 60.0,
    }


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
