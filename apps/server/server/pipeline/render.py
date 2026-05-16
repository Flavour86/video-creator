"""Render orchestration for draft and final compose jobs."""

from __future__ import annotations

import asyncio
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from collections.abc import Coroutine, Iterable
from concurrent.futures import Future
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from server.db.renders import (
    insert_render,
    mark_render_cancelled,
    mark_render_failed,
    mark_render_finished,
)
from server.domain.project import Project, load_project
from server.domain.timing import AlignmentResult
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment
from server.pipeline.clip_render import render_clip_to_cache
from server.pipeline.filtergraph import (
    PRESETS,
    RenderPreset,
    build_compose_command,
    visual_items_bottom_to_top,
)
from server.pipeline.render_progress import (
    RenderLogEvent,
    RenderProgressEvent,
    RenderStage,
    publish_log,
    publish_progress,
)
from server.pipeline.srt import write_srt


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
    fps: float | None = None
    speed: float | None = None
    frame_count: int | None = None


class RenderError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


_active_projects: dict[str, str] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}
_active_jobs: dict[str, RenderJob] = {}

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
    if project_key in _active_projects:
        raise RenderError(409, "RENDER_IN_PROGRESS", "Render already running for this project.")

    _active_projects[project_key] = job.render_id
    _active_jobs[job.render_id] = job
    task = asyncio.create_task(_run_job(job, raise_errors=False))
    _active_tasks[job.render_id] = task
    task.add_done_callback(lambda _task: _clear_active(job))
    return RenderResult(render_id=job.render_id, output_path=job.output_path)


async def render_project(
    *,
    project_dir: Path,
    preset: RenderPreset,
    resolution: str | None = None,
) -> RenderResult:
    job = _create_job(project_dir=project_dir, preset=preset, resolution=resolution)
    await _run_job(job, raise_errors=True)
    return RenderResult(render_id=job.render_id, output_path=job.output_path)


async def cancel_render(render_id: str) -> bool:
    task = _active_tasks.get(render_id)
    if task is None:
        return False
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
    project = load_project(project_dir)
    preset_config = PRESETS[preset]
    resolved_resolution = _resolve_render_resolution(project, preset, resolution)
    width, height = _resolution_dimensions(resolved_resolution)
    render_id = _new_render_id()
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


async def _run_job(job: RenderJob, *, raise_errors: bool) -> None:
    timer = time.perf_counter()

    try:
        await _emit(job.render_id, "cache_warm", 1.0, message="verifying cache")
        await _emit(job.render_id, "cache_warm", 4.0, message="building subtitles.srt")
        alignment = await _ensure_alignment(job.project_dir, job.project)
        preset_config = PRESETS[job.preset]
        await _warm_clip_cache(
            project_dir=job.project_dir,
            project=job.project,
            resolution=job.resolution,
            fps=preset_config.fps,
            crf=preset_config.crf,
            render_id=job.render_id,
        )
        await _emit(job.render_id, "compose", 12.0, message="ffmpeg compose")
        command = build_compose_command(
            project_dir=job.project_dir,
            project=job.project,
            alignment=alignment,
            output_path=job.output_path,
            preset=job.preset,
            resolution=job.resolution,
        )
        media_stats = await _run_ffmpeg(
            _with_progress(command),
            job.output_path,
            render_id=job.render_id,
            total_s=_alignment_duration_s(alignment),
        )
        await _emit(job.render_id, "muxing", 98.0, message="muxing audio")
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
        await _emit(job.render_id, "error", 0.0, message=exc.message)
        if raise_errors:
            raise
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        mark_render_failed(render_id=job.render_id, finished_at=datetime.now(UTC), message=message)
        _discard_partial(job.output_path)
        await _emit(job.render_id, "error", 0.0, message=message)
        if raise_errors:
            raise RenderError(500, "RENDER_FAILED", message) from exc
    else:
        duration_s = time.perf_counter() - timer
        mark_render_finished(
            render_id=job.render_id,
            finished_at=datetime.now(UTC),
            duration_s=duration_s,
            output_path=job.output_path,
            fps=media_stats.fps,
            speed=media_stats.speed,
            frame_count=media_stats.frame_count,
        )
        await _emit(
            job.render_id,
            "done",
            100.0,
            message="Draft ready" if job.preset == "draft" else "Render ready",
            output_path=str(job.output_path),
        )


def _clear_active(job: RenderJob) -> None:
    project_key = str(job.project_dir.resolve())
    if _active_projects.get(project_key) == job.render_id:
        _active_projects.pop(project_key, None)
    _active_tasks.pop(job.render_id, None)
    _active_jobs.pop(job.render_id, None)


async def _ensure_alignment(project_dir: Path, project: Project) -> AlignmentResult:
    audio_path = project_dir / project.audio
    if not project.audio or not audio_path.is_file():
        raise RenderError(404, "AUDIO_NOT_FOUND", "Audio file not found.")

    transcript_path = project_dir / project.transcript.path
    if not transcript_path.is_file():
        raise RenderError(404, "TRANSCRIPT_NOT_FOUND", "Transcript file not found.")

    transcript_text = transcript_path.read_text(encoding="utf-8")
    current_hash = compute_alignment_hash(audio_path, transcript_text)
    vc_dir = project_dir / ".vc"
    alignment_file = vc_dir / "alignment.json"
    hash_file = vc_dir / "alignment.hash"

    if alignment_file.is_file() and hash_file.is_file():
        cached_hash = hash_file.read_text(encoding="utf-8").strip()
        if cached_hash == current_hash:
            cached = AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))
            write_srt(project_dir, cached)
            return cached

    from server.pipeline.transcribe import align  # lazy import keeps unit tests light

    result = await align(audio_path, segment(transcript_text))
    vc_dir.mkdir(parents=True, exist_ok=True)
    alignment_file.write_text(result.model_dump_json(), encoding="utf-8")
    write_srt(project_dir, result)
    hash_file.write_text(current_hash, encoding="utf-8")
    return result


async def _warm_clip_cache(
    *,
    project_dir: Path,
    project: Project,
    resolution: str,
    fps: int,
    crf: int,
    render_id: str,
) -> None:
    items = visual_items_bottom_to_top(project)
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
            "cache_warm",
            min(10.0, (index / total) * 10.0),
            message="pre-rendering clips",
        )


async def _run_ffmpeg(
    command: list[str],
    output_path: Path,
    *,
    render_id: str,
    total_s: float,
) -> _RenderMediaStats:
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
        )
    if proc.stdout is None or proc.stderr is None:
        raise RenderError(500, "FFMPEG_FAILED", "ffmpeg progress pipes were not available.")

    stderr_lines: list[str] = []
    stderr_task = asyncio.create_task(_relay_stderr(proc.stderr, render_id, stderr_lines))
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
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")
    return _stats_from_progress(progress)


async def _run_ffmpeg_threaded(
    command: list[str],
    output_path: Path,
    *,
    render_id: str,
    total_s: float,
) -> _RenderMediaStats:
    loop = asyncio.get_running_loop()
    state = _SyncProcessState()
    task = asyncio.create_task(
        asyncio.to_thread(_run_ffmpeg_sync, command, output_path, render_id, total_s, loop, state)
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
        args=(proc.stderr, render_id, stderr_lines, loop),
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
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")
    return _stats_from_progress(progress)


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
        )
    )


async def _emit_log(render_id: str, line: str) -> None:
    await publish_log(RenderLogEvent(render_id=render_id, line=line))


async def _relay_stderr(
    stream: asyncio.StreamReader,
    render_id: str,
    sink: list[str],
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
        await _emit_log(render_id, line)


def _relay_stderr_sync(
    stream: Iterable[str],
    render_id: str,
    sink: list[str],
    loop: asyncio.AbstractEventLoop,
) -> None:
    for raw_line in stream:
        line = _strip_ansi(str(raw_line).rstrip())
        if not line:
            continue
        sink.append(line)
        if len(sink) > 200:
            del sink[: len(sink) - 200]
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
        "compose",
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


def _int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _eta_seconds(total_s: float, out_time_s: float, speed: str | None) -> int | None:
    if not speed or not speed.endswith("x"):
        return None
    try:
        speed_value = float(speed[:-1])
    except ValueError:
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


def _float_or_none(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _new_render_id() -> str:
    return f"r-{datetime.now(UTC).strftime('%Y-%m-%d-%H%M')}-{secrets.token_hex(3)}"


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
        return project_dir / ".vc" / "drafts" / f"{render_id}.mp4"
    return project_dir / "renders" / f"{render_id}.mp4"


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
