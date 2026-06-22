"""Render orchestration for draft and final compose jobs."""

from __future__ import annotations

import asyncio
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from collections import deque
from collections.abc import Coroutine, Iterable
from concurrent.futures import Future
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from server.db.project_configs import latest_config_for_project_path
from server.db.renders import (
    add_render_artifact,
    get_render,
    insert_render,
    mark_render_cancelled,
    mark_render_failed,
    mark_render_finished,
    mark_render_started,
)
from server.domain.project import Project, load_project
from server.domain.timing import AlignmentResult
from server.pipeline.cache import (
    alignment_device_for_language,
    alignment_language_for_text,
    compute_alignment_hash,
)
from server.pipeline.chunker import segment
from server.pipeline.clip_render import render_clip_to_cache
from server.pipeline.filtergraph import (
    PRESETS,
    RenderPreset,
    build_compose_command,
    visual_items_bottom_to_top,
)
from server.pipeline.render_manifest import write_render_manifest
from server.pipeline.render_progress import (
    RenderLogEvent,
    RenderProgressEvent,
    RenderStage,
    publish_log,
    publish_progress,
)
from server.pipeline.srt import alignment_with_sentence_text_overrides, write_srt

DRAFT_DURATION_LIMIT_S = 60.0


@dataclass(frozen=True)
class RenderJob:
    render_id: str
    project_dir: Path
    project: Project
    preset: RenderPreset
    resolution: str
    output_path: Path
    started_at: datetime


class RenderResult(BaseModel):
    render_id: str
    output_path: Path


@dataclass
class _SyncProcessState:
    proc: subprocess.Popen[str] | None = None


@dataclass(frozen=True)
class _RenderMediaStats:
    duration_s: float | None = None
    fps: float | None = None
    speed: float | None = None
    frame_count: int | None = None
    width: int | None = None
    height: int | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    audio_bitrate_kbps: int | None = None
    audio_sample_rate: int | None = None
    faststart: bool | None = None
    streams: list[dict[str, object]] | None = None

    def merged_with(self, probed: _RenderMediaStats) -> _RenderMediaStats:
        return _RenderMediaStats(
            duration_s=probed.duration_s or self.duration_s,
            fps=probed.fps or self.fps,
            speed=self.speed,
            frame_count=self.frame_count,
            width=probed.width or self.width,
            height=probed.height or self.height,
            video_codec=probed.video_codec or self.video_codec,
            audio_codec=probed.audio_codec or self.audio_codec,
            audio_bitrate_kbps=probed.audio_bitrate_kbps or self.audio_bitrate_kbps,
            audio_sample_rate=probed.audio_sample_rate or self.audio_sample_rate,
            faststart=probed.faststart if probed.faststart is not None else self.faststart,
            streams=probed.streams or self.streams,
        )


class RenderError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


_active_projects: dict[str, str] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}
_active_jobs: dict[str, RenderJob] = {}
_project_queues: dict[str, deque[RenderJob]] = {}
_queued_jobs: dict[str, RenderJob] = {}

_RESOLUTION_ALIASES: dict[str, str] = {
    "1080p": "1920x1080",
    "720p": "1280x720",
    "9:16": "1080x1920",
    "1920x1080": "1920x1080",
    "1280x720": "1280x720",
    "1080x1920": "1080x1920",
}


async def start_render_project(
    *,
    project_dir: Path,
    preset: RenderPreset,
    resolution: str | None = None,
) -> RenderResult:
    job = _create_job(project_dir=project_dir, preset=preset, resolution=resolution)
    project_key = str(project_dir.resolve())
    is_queued = project_key in _active_projects or bool(_project_queues.get(project_key))
    _project_queues.setdefault(project_key, deque()).append(job)
    _queued_jobs[job.render_id] = job
    if not is_queued:
        _start_next_job(project_key)
    else:
        await _emit(job.render_id, "queued", 0.0, message="queued")
    return RenderResult(render_id=job.render_id, output_path=job.output_path)


async def render_project(
    *,
    project_dir: Path,
    preset: RenderPreset,
    resolution: str | None = None,
) -> RenderResult:
    job = _create_job(project_dir=project_dir, preset=preset, resolution=resolution)
    mark_render_started(render_id=job.render_id)
    await _run_job(job, raise_errors=True)
    return RenderResult(render_id=job.render_id, output_path=job.output_path)


async def cancel_render(render_id: str) -> bool:
    task = _active_tasks.get(render_id)
    if task is None:
        queued_job = _pop_queued_job(render_id)
        if queued_job is None:
            return False
        mark_render_cancelled(
            render_id=render_id,
            finished_at=datetime.now(UTC),
            message="Render canceled before start.",
        )
        await _emit(render_id, "cancelled", 0.0, message="Render canceled before start.")
        return True
    await _emit(render_id, "cancelling", 0.0, message="cancelling")
    task.cancel()
    return True


def active_render_count() -> int:
    return len(_active_jobs)


def _create_job(
    *,
    project_dir: Path,
    preset: RenderPreset,
    resolution: str | None = None,
) -> RenderJob:
    project = _load_render_project(project_dir)
    preset_config = PRESETS[preset]
    resolved_resolution = _resolve_render_resolution(project, preset, resolution)
    width, height = _resolution_dimensions(resolved_resolution)
    render_id = _new_unique_render_id()
    output_path = _output_path(project_dir, preset, render_id)
    started_at = datetime.now(UTC)
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=output_path,
        preset=preset,
        started_at=started_at,
        resolution=resolved_resolution,
        width=width,
        height=height,
        video_crf=preset_config.crf,
        video_preset=preset_config.x264_preset,
        audio_bitrate_kbps=int(preset_config.audio_bitrate.removesuffix("k")),
    )
    return RenderJob(
        render_id=render_id,
        project_dir=project_dir,
        project=project,
        preset=preset,
        resolution=resolved_resolution,
        output_path=output_path,
        started_at=started_at,
    )


def _load_render_project(project_dir: Path) -> Project:
    snapshot = latest_config_for_project_path(project_dir)
    if snapshot is not None:
        return Project.model_validate(snapshot)
    try:
        return load_project(project_dir)
    except FileNotFoundError as exc:
        raise RenderError(404, "PROJECT_NOT_FOUND", "Project not found.") from exc


async def _run_job(job: RenderJob, *, raise_errors: bool) -> None:
    timer = time.perf_counter()

    try:
        await _emit(job.render_id, "queued", 0.0, message="queued")
        await _emit(job.render_id, "verify_alignment_cache", 1.0, message="verifying cache")
        alignment = await _ensure_alignment(job.project_dir, job.project)
        preset_config = PRESETS[job.preset]
        duration_limit_s = _duration_limit_s_for_preset(job.preset)
        await _warm_clip_cache(
            project_dir=job.project_dir,
            project=job.project,
            resolution=job.resolution,
            fps=preset_config.fps,
            crf=preset_config.crf,
            render_id=job.render_id,
            duration_limit_s=duration_limit_s,
        )
        await _emit(job.render_id, "build_subtitles_srt", 10.0, message="building subtitles.srt")
        await _emit(job.render_id, "compose_filtergraph", 12.0, message="ffmpeg compose")
        command = build_compose_command(
            project_dir=job.project_dir,
            project=job.project,
            alignment=alignment,
            output_path=job.output_path,
            preset=job.preset,
            resolution=job.resolution,
            duration_limit_s=duration_limit_s,
        )
        media_stats = await _run_ffmpeg(
            _with_progress(command),
            job.output_path,
            render_id=job.render_id,
            total_s=_render_progress_total_s(alignment, duration_limit_s),
            log_path=_render_log_path(job.project_dir, job.render_id),
        )
        await _emit(job.render_id, "mux_mp4_faststart", 98.0, message="muxing audio")
    except asyncio.CancelledError:
        message = "Render canceled."
        partial_path = _preserve_partial(job.output_path)
        mark_render_cancelled(
            render_id=job.render_id,
            finished_at=datetime.now(UTC),
            message=message,
            output_path=partial_path,
        )
        await _emit(job.render_id, "cancelled", 0.0, message=message)
        if raise_errors:
            raise RenderError(409, "RENDER_CANCELED", message) from None
    except RenderError as exc:
        mark_render_failed(
            render_id=job.render_id,
            finished_at=datetime.now(UTC),
            message=exc.message,
        )
        _discard_partial(job.output_path)
        await _emit(job.render_id, "failed", 0.0, message=exc.message)
        if raise_errors:
            raise
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        mark_render_failed(render_id=job.render_id, finished_at=datetime.now(UTC), message=message)
        _discard_partial(job.output_path)
        await _emit(job.render_id, "failed", 0.0, message=message)
        if raise_errors:
            raise RenderError(500, "RENDER_FAILED", message) from exc
    else:
        duration_s = media_stats.duration_s or (time.perf_counter() - timer)
        await _emit(
            job.render_id,
            "append_render_history_to_app_db",
            99.0,
            message="appending render history",
        )
        try:
            manifest_path = write_render_manifest(
                project_dir=job.project_dir,
                render_id=job.render_id,
                project=job.project,
                alignment=alignment,
                resolution=job.resolution,
                duration_limit_s=duration_limit_s,
                max_line_chars=_subtitle_max_line_chars(job.project),
            )
            mark_render_finished(
                render_id=job.render_id,
                finished_at=datetime.now(UTC),
                duration_s=duration_s,
                output_path=job.output_path,
                fps=media_stats.fps,
                speed=media_stats.speed,
                frame_count=media_stats.frame_count,
                width=media_stats.width,
                height=media_stats.height,
                video_codec=media_stats.video_codec,
                audio_codec=media_stats.audio_codec,
                audio_bitrate_kbps=media_stats.audio_bitrate_kbps,
                audio_sample_rate=media_stats.audio_sample_rate,
            )
            if get_render(job.render_id) is not None:
                add_render_artifact(render_id=job.render_id, kind="manifest", path=manifest_path)
        except Exception as exc:
            message = f"Render history update failed: {exc}"
            with suppress(Exception):
                mark_render_failed(
                    render_id=job.render_id,
                    finished_at=datetime.now(UTC),
                    message=message,
                    output_path=job.output_path,
                )
            await _emit(
                job.render_id,
                "failed",
                0.0,
                message=message,
                output_path=str(job.output_path),
                metadata=_metadata_detail(media_stats),
            )
            if raise_errors:
                raise RenderError(500, "RENDER_HISTORY_FAILED", message) from exc
            return
        await _emit(
            job.render_id,
            "done",
            100.0,
            message="Draft ready" if job.preset == "draft" else "Render ready",
            output_path=str(job.output_path),
            metadata=_metadata_detail(media_stats),
        )


def _clear_active(job: RenderJob) -> None:
    project_key = str(job.project_dir.resolve())
    if _active_projects.get(project_key) == job.render_id:
        _active_projects.pop(project_key, None)
    _active_tasks.pop(job.render_id, None)
    _active_jobs.pop(job.render_id, None)
    _start_next_job(project_key)


def _start_next_job(project_key: str) -> None:
    queue = _project_queues.get(project_key)
    if queue is None:
        return
    while queue:
        job = queue.popleft()
        _queued_jobs.pop(job.render_id, None)
        mark_render_started(render_id=job.render_id)
        _active_projects[project_key] = job.render_id
        _active_jobs[job.render_id] = job
        task = asyncio.create_task(_run_job(job, raise_errors=False))
        _active_tasks[job.render_id] = task
        task.add_done_callback(partial(_handle_task_done, job))
        break
    if not queue:
        _project_queues.pop(project_key, None)


def _pop_queued_job(render_id: str) -> RenderJob | None:
    job = _queued_jobs.pop(render_id, None)
    if job is None:
        return None
    project_key = str(job.project_dir.resolve())
    queue = _project_queues.get(project_key)
    if queue is not None:
        _project_queues[project_key] = deque(item for item in queue if item.render_id != render_id)
        if not _project_queues[project_key]:
            _project_queues.pop(project_key, None)
    return job


def _handle_task_done(job: RenderJob, _task: asyncio.Task[None]) -> None:
    _clear_active(job)


async def _ensure_alignment(project_dir: Path, project: Project) -> AlignmentResult:
    audio_path = project_dir / project.audio
    if not project.audio or not audio_path.is_file():
        raise RenderError(404, "AUDIO_NOT_FOUND", "Audio file not found.")

    transcript_path = project_dir / project.transcript.path
    if not transcript_path.is_file():
        raise RenderError(404, "TRANSCRIPT_NOT_FOUND", "Transcript file not found.")

    transcript_text = transcript_path.read_text(encoding="utf-8")
    alignment_language = alignment_language_for_text(transcript_text)
    preferred_device = alignment_device_for_language(alignment_language)
    current_hash = compute_alignment_hash(
        audio_path,
        transcript_text,
        language=alignment_language,
    )
    vc_dir = project_dir / ".vc"
    alignment_file = vc_dir / "alignment.json"
    hash_file = vc_dir / "alignment.hash"

    if alignment_file.is_file() and hash_file.is_file():
        cached_hash = hash_file.read_text(encoding="utf-8").strip()
        if cached_hash == current_hash:
            cached = AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))
            subtitle_alignment = _subtitle_alignment_for_project(cached, project)
            write_srt(
                project_dir,
                subtitle_alignment,
                max_line_chars=_subtitle_max_line_chars(project),
            )
            return subtitle_alignment

    from server.pipeline.transcribe import align  # lazy import keeps unit tests light

    result = await align(
        audio_path,
        segment(transcript_text),
        language=alignment_language,
        device=preferred_device,
    )
    vc_dir.mkdir(parents=True, exist_ok=True)
    alignment_file.write_text(result.model_dump_json(), encoding="utf-8")
    subtitle_alignment = _subtitle_alignment_for_project(result, project)
    write_srt(project_dir, subtitle_alignment, max_line_chars=_subtitle_max_line_chars(project))
    hash_file.write_text(current_hash, encoding="utf-8")
    return subtitle_alignment


def _subtitle_alignment_for_project(
    alignment: AlignmentResult,
    project: Project,
) -> AlignmentResult:
    transcript = getattr(project, "transcript", None)
    return alignment_with_sentence_text_overrides(
        alignment,
        getattr(transcript, "sentences", None),
    )


def _subtitle_max_line_chars(project: Project) -> int:
    subtitles = getattr(project, "subtitles", None)
    style = getattr(subtitles, "style", None)
    max_chars = getattr(style, "max_chars_per_line", None)
    if not isinstance(max_chars, int):
        return 42
    return max(20, min(80, max_chars))


async def _warm_clip_cache(
    *,
    project_dir: Path,
    project: Project,
    resolution: str,
    fps: int,
    crf: int,
    render_id: str,
    duration_limit_s: float | None = None,
) -> None:
    items = visual_items_bottom_to_top(project, duration_limit_s=duration_limit_s)
    if not items:
        await _emit(render_id, "pre_render_cached_clips", 9.0, message="pre-rendering clips")
        return
    total = max(1, len(items))
    for index, item in enumerate(items, start=1):
        await asyncio.to_thread(
            render_clip_to_cache,
            item=item,
            project_dir=project_dir,
            resolution=resolution,
            fps=fps,
            crf=crf,
        )
        await _emit(
            render_id,
            "pre_render_cached_clips",
            min(9.0, (index / total) * 9.0),
            message="pre-rendering clips",
        )


async def _run_ffmpeg(
    command: list[str],
    output_path: Path,
    *,
    render_id: str,
    total_s: float,
    log_path: Path | None = None,
) -> _RenderMediaStats:
    resolved_log_path = log_path or output_path.with_suffix(".log")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        return await _run_ffmpeg_threaded(
            command,
            output_path,
            render_id=render_id,
            total_s=total_s,
            log_path=resolved_log_path,
        )
    if proc.stdout is None or proc.stderr is None:
        raise RenderError(500, "FFMPEG_FAILED", "ffmpeg progress pipes were not available.")

    stderr_lines: list[str] = []
    stderr_task = asyncio.create_task(
        _relay_stderr(proc.stderr, render_id, stderr_lines, log_path=resolved_log_path)
    )
    progress: dict[str, str] = {}
    try:
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode(errors="replace").strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            progress[key] = value
            if key == "progress":
                await _emit_ffmpeg_progress(render_id, progress, total_s)

        await proc.wait()
        with suppress(asyncio.CancelledError):
            await stderr_task
    except asyncio.CancelledError:
        if proc.returncode is None:
            proc.terminate()
            with suppress(TimeoutError):
                await asyncio.wait_for(proc.wait(), timeout=5)
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
        stderr_task.cancel()
        with suppress(asyncio.CancelledError):
            await stderr_task
        raise
    if proc.returncode != 0:
        detail = "\n".join(stderr_lines[-20:]).strip()
        _persist_render_log_artifact(render_id, resolved_log_path)
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        _persist_render_log_artifact(render_id, resolved_log_path)
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")
    _persist_render_log_artifact(render_id, resolved_log_path)
    return _stats_from_progress(progress).merged_with(_probe_output_metadata(output_path))


async def _run_ffmpeg_threaded(
    command: list[str],
    output_path: Path,
    *,
    render_id: str,
    total_s: float,
    log_path: Path,
) -> _RenderMediaStats:
    loop = asyncio.get_running_loop()
    state = _SyncProcessState()
    task = asyncio.create_task(
        asyncio.to_thread(
            _run_ffmpeg_sync,
            command,
            output_path,
            render_id,
            total_s,
            loop,
            state,
            log_path,
        )
    )
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await asyncio.to_thread(_terminate_sync_process, state.proc)
        with suppress(Exception):
            await asyncio.shield(task)
        raise


def _run_ffmpeg_sync(
    command: list[str],
    output_path: Path,
    render_id: str,
    total_s: float,
    loop: asyncio.AbstractEventLoop,
    state: _SyncProcessState,
    log_path: Path,
) -> _RenderMediaStats:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    state.proc = proc
    if proc.stdout is None or proc.stderr is None:
        raise RenderError(500, "FFMPEG_FAILED", "ffmpeg progress pipes were not available.")

    stderr_lines: list[str] = []
    stderr_thread = threading.Thread(
        target=_relay_stderr_sync,
        args=(proc.stderr, render_id, stderr_lines, loop, log_path),
        daemon=True,
    )
    stderr_thread.start()

    progress: dict[str, str] = {}
    try:
        for raw_line in proc.stdout:
            line = raw_line.strip()
            if not line or "=" not in line:
                continue
            key, value = line.split("=", 1)
            progress[key] = value
            if key == "progress":
                _publish_from_thread(loop, _emit_ffmpeg_progress(render_id, progress, total_s))
        proc.wait()
    finally:
        stderr_thread.join(timeout=5)

    if proc.returncode != 0:
        detail = "\n".join(stderr_lines[-20:]).strip()
        _persist_render_log_artifact(render_id, log_path)
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        _persist_render_log_artifact(render_id, log_path)
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")
    _persist_render_log_artifact(render_id, log_path)
    return _stats_from_progress(progress).merged_with(_probe_output_metadata(output_path))


def _terminate_sync_process(proc: subprocess.Popen[str] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


def _with_progress(command: list[str]) -> list[str]:
    return [*command[:2], "-progress", "pipe:1", "-nostats", *command[2:]]


async def _emit(
    render_id: str,
    stage: RenderStage,
    percent: float,
    *,
    eta_seconds: int | None = None,
    current_frame: int | None = None,
    speed: str | None = None,
    message: str | None = None,
    output_path: str | None = None,
    metadata: dict[str, object] | None = None,
) -> None:
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage=stage,
            percent=max(0.0, min(100.0, percent)),
            eta_seconds=eta_seconds,
            current_frame=current_frame,
            speed=speed,
            message=message,
            output_path=output_path,
            metadata=metadata,
        )
    )


async def _emit_log(render_id: str, line: str) -> None:
    await publish_log(RenderLogEvent(render_id=render_id, line=line))


def _render_log_path(project_dir: Path, render_id: str) -> Path:
    return project_dir / ".vc" / "logs" / f"{render_id}.log"


def _append_log_line(log_path: Path, line: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as file:
        file.write(f"{line}\n")


def _persist_render_log_artifact(render_id: str, log_path: Path) -> None:
    if not log_path.is_file() or log_path.stat().st_size == 0:
        return
    existing = get_render(render_id)
    if existing is None:
        return
    add_render_artifact(render_id=render_id, kind="log", path=log_path)


async def _relay_stderr(
    stream: asyncio.StreamReader,
    render_id: str,
    sink: list[str],
    *,
    log_path: Path,
) -> None:
    while True:
        line_bytes = await stream.readline()
        if not line_bytes:
            break
        line = _strip_ansi(line_bytes.decode(errors="replace").rstrip())
        if not line:
            continue
        sink.append(line)
        if len(sink) > 200:
            del sink[: len(sink) - 200]
        _append_log_line(log_path, line)
        await _emit_log(render_id, line)


def _relay_stderr_sync(
    stream: Iterable[str],
    render_id: str,
    sink: list[str],
    loop: asyncio.AbstractEventLoop,
    log_path: Path,
) -> None:
    for raw_line in stream:
        line = _strip_ansi(str(raw_line).rstrip())
        if not line:
            continue
        sink.append(line)
        if len(sink) > 200:
            del sink[: len(sink) - 200]
        _append_log_line(log_path, line)
        _publish_from_thread(loop, _emit_log(render_id, line))


def _publish_from_thread(
    loop: asyncio.AbstractEventLoop,
    coro: Coroutine[Any, Any, None],
) -> None:
    future: Future[None] = asyncio.run_coroutine_threadsafe(coro, loop)
    with suppress(Exception):
        future.result(timeout=2)


def _strip_ansi(value: str) -> str:
    return re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", value)


async def _emit_ffmpeg_progress(
    render_id: str,
    progress: dict[str, str],
    total_s: float,
) -> None:
    out_time_us = _int_or_none(progress.get("out_time_us")) or 0
    out_time_s = out_time_us / 1_000_000
    percent = 12.0 + min(85.0, (out_time_s / max(total_s, 0.001)) * 85.0)
    speed = progress.get("speed")
    await _emit(
        render_id,
        "compose_filtergraph",
        percent,
        eta_seconds=_eta_seconds(total_s, out_time_s, speed),
        current_frame=_int_or_none(progress.get("frame")),
        speed=speed,
        message="ffmpeg compose",
    )


def _alignment_duration_s(alignment: AlignmentResult) -> float:
    if alignment.sentences:
        return max(sentence.end_s for sentence in alignment.sentences)
    return 0.001


def _duration_limit_s_for_preset(preset: RenderPreset) -> float | None:
    if preset == "draft":
        return DRAFT_DURATION_LIMIT_S
    return None


def _render_progress_total_s(
    alignment: AlignmentResult,
    duration_limit_s: float | None,
) -> float:
    total_s = _alignment_duration_s(alignment)
    if duration_limit_s is None:
        return total_s
    return min(total_s, max(0.001, duration_limit_s))


def _int_or_none(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if not isinstance(value, str):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _eta_seconds(total_s: float, out_time_s: float, speed: str | None) -> int | None:
    if not speed or not speed.endswith("x"):
        return None
    try:
        speed_value = float(speed[:-1])
    except (TypeError, ValueError):
        return None
    if speed_value <= 0:
        return None
    return max(0, round((total_s - out_time_s) / speed_value))


def _stats_from_progress(progress: dict[str, str]) -> _RenderMediaStats:
    fps = _float_or_none(progress.get("fps"))
    frame_count = _int_or_none(progress.get("frame"))
    speed_value: float | None = None
    speed = progress.get("speed")
    if speed and speed.endswith("x"):
        speed_value = _float_or_none(speed[:-1])
    return _RenderMediaStats(fps=fps, speed=speed_value, frame_count=frame_count)


def _probe_output_metadata(output_path: Path) -> _RenderMediaStats:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(output_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return _RenderMediaStats()
    try:
        payload = json.loads(result.stdout)
    except (TypeError, ValueError):
        return _RenderMediaStats()
    if not isinstance(payload, dict):
        return _RenderMediaStats()
    streams = payload.get("streams")
    stream_rows: list[dict[str, object]] = (
        [dict(row) for row in streams if isinstance(row, dict)]
        if isinstance(streams, list)
        else []
    )
    video = _first_stream(stream_rows, "video")
    audio = _first_stream(stream_rows, "audio")
    width = _int_or_none(video.get("width")) if video is not None else None
    height = _int_or_none(video.get("height")) if video is not None else None
    raw_format = payload.get("format")
    format_row: dict[str, object] = dict(raw_format) if isinstance(raw_format, dict) else {}
    return _RenderMediaStats(
        duration_s=_float_or_none(format_row.get("duration")),
        fps=_frame_rate(video.get("avg_frame_rate") if video is not None else None),
        width=width,
        height=height,
        video_codec=(
            str(video["codec_name"]) if video is not None and video.get("codec_name") else None
        ),
        audio_codec=(
            str(audio["codec_name"]) if audio is not None and audio.get("codec_name") else None
        ),
        audio_bitrate_kbps=_kbps(audio.get("bit_rate") if audio is not None else None),
        audio_sample_rate=_int_or_none(audio.get("sample_rate")) if audio is not None else None,
        faststart=_has_faststart(output_path),
        streams=[dict(row) for row in stream_rows],
    )


def _first_stream(streams: list[dict[str, object]], codec_type: str) -> dict[str, object] | None:
    for stream in streams:
        if stream.get("codec_type") == codec_type:
            return stream
    return None


def _frame_rate(raw_value: object) -> float | None:
    if not isinstance(raw_value, str) or raw_value in {"0/0", ""}:
        return None
    if "/" not in raw_value:
        return _float_or_none(raw_value)
    numerator, denominator = raw_value.split("/", maxsplit=1)
    top = _float_or_none(numerator)
    bottom = _float_or_none(denominator)
    if top is None or bottom is None or bottom == 0:
        return None
    return top / bottom


def _kbps(raw_value: object) -> int | None:
    value = _int_or_none(raw_value)
    if value is None:
        return None
    return round(value / 1000)


def _has_faststart(output_path: Path) -> bool | None:
    try:
        file_size = output_path.stat().st_size
        with output_path.open("rb") as file:
            seen_mdat = False
            offset = 0
            while offset + 8 <= file_size and offset < 1024 * 1024:
                header = file.read(8)
                if len(header) < 8:
                    return None
                atom_size = int.from_bytes(header[:4], "big")
                atom_type = header[4:8]
                header_size = 8
                if atom_size == 1:
                    large_size = file.read(8)
                    if len(large_size) < 8:
                        return None
                    atom_size = int.from_bytes(large_size, "big")
                    header_size = 16
                if atom_size < header_size:
                    return None
                if atom_type == b"moov":
                    return not seen_mdat
                if atom_type == b"mdat":
                    seen_mdat = True
                file.seek(atom_size - header_size, os.SEEK_CUR)
                offset += atom_size
    except OSError:
        return None
    return None


def _metadata_detail(stats: _RenderMediaStats) -> dict[str, object]:
    return {
        "duration_s": stats.duration_s,
        "width": stats.width,
        "height": stats.height,
        "video_codec": stats.video_codec,
        "audio_codec": stats.audio_codec,
        "audio_bitrate_kbps": stats.audio_bitrate_kbps,
        "audio_sample_rate": stats.audio_sample_rate,
        "faststart": stats.faststart,
        "streams": stats.streams or [],
    }


def _float_or_none(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, int | float):
        return float(value)
    if not isinstance(value, str):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _new_render_id() -> str:
    return f"r-{datetime.now(UTC).strftime('%Y-%m-%d-%H%M')}-{secrets.token_hex(3)}"


def _new_unique_render_id() -> str:
    for _ in range(10):
        render_id = _new_render_id()
        if get_render(render_id) is None:
            return render_id
    raise RenderError(500, "RENDER_ID_COLLISION", "Unable to allocate a render id.")


def _resolve_render_resolution(
    project: Project,
    preset: RenderPreset,
    requested: str | None,
) -> str:
    output = getattr(project, "output", None)
    output_resolution = getattr(output, "resolution", None) if output is not None else None
    for candidate in (requested, output_resolution):
        if candidate is None:
            continue
        mapped = _RESOLUTION_ALIASES.get(str(candidate))
        if mapped is not None:
            return mapped
    return PRESETS[preset].resolution


def _resolution_dimensions(resolution: str) -> tuple[int, int]:
    width, height = resolution.split("x", maxsplit=1)
    return int(width), int(height)


def _output_path(project_dir: Path, preset: RenderPreset, render_id: str) -> Path:
    if preset == "draft":
        base_path = project_dir / ".vc" / "drafts" / f"{render_id}.mp4"
    else:
        base_path = project_dir / "renders" / f"{render_id}.mp4"
    if not base_path.exists():
        return base_path
    for index in range(2, 1000):
        candidate = base_path.with_name(f"{base_path.stem}-{index}{base_path.suffix}")
        if not candidate.exists():
            return candidate
    raise RenderError(500, "RENDER_OUTPUT_COLLISION", "Unable to allocate render output path.")


def _discard_partial(output_path: Path) -> None:
    if output_path.exists():
        output_path.unlink()


def _preserve_partial(output_path: Path) -> Path | None:
    if not output_path.exists():
        return None
    if output_path.stat().st_size == 0:
        output_path.unlink()
        return None
    partial_path = output_path.with_name(f"{output_path.name}.partial")
    if partial_path.exists():
        partial_path.unlink()
    output_path.replace(partial_path)
    return partial_path


def reveal_in_file_browser(path: Path) -> None:
    target = path if path.is_dir() else path.parent
    if os.name == "nt":
        startfile = getattr(os, "startfile", None)
        if callable(startfile):
            startfile(str(target))
            return
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(target)])
        return
    subprocess.Popen(["xdg-open", str(target)])


def open_in_default_player(path: Path) -> None:
    if os.name == "nt":
        startfile = getattr(os, "startfile", None)
        if callable(startfile):
            startfile(str(path))
            return
    if sys.platform == "darwin":
        subprocess.Popen(["open", str(path)])
        return
    subprocess.Popen(["xdg-open", str(path)])
