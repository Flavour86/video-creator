"""Render orchestration for draft and final compose jobs."""

from __future__ import annotations

import asyncio
import os
import secrets
import subprocess
import sys
import time
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel

from server.db.renders import insert_render, mark_render_failed, mark_render_finished
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
from server.pipeline.render_progress import RenderProgressEvent, RenderStage, publish_progress
from server.pipeline.srt import write_srt


@dataclass(frozen=True)
class RenderJob:
    render_id: str
    project_dir: Path
    project: Project
    preset: RenderPreset
    output_path: Path
    started_at: datetime


class RenderResult(BaseModel):
    render_id: str
    output_path: Path


class RenderError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


_active_projects: dict[str, str] = {}
_active_tasks: dict[str, asyncio.Task[None]] = {}
_active_jobs: dict[str, RenderJob] = {}


async def start_render_project(*, project_dir: Path, preset: RenderPreset) -> RenderResult:
    job = _create_job(project_dir=project_dir, preset=preset)
    project_key = str(project_dir.resolve())
    if project_key in _active_projects:
        raise RenderError(409, "RENDER_IN_PROGRESS", "Render already running for this project.")

    _active_projects[project_key] = job.render_id
    _active_jobs[job.render_id] = job
    task = asyncio.create_task(_run_job(job, raise_errors=False))
    _active_tasks[job.render_id] = task
    task.add_done_callback(lambda _task: _clear_active(job))
    return RenderResult(render_id=job.render_id, output_path=job.output_path)


async def render_project(*, project_dir: Path, preset: RenderPreset) -> RenderResult:
    job = _create_job(project_dir=project_dir, preset=preset)
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


def _create_job(*, project_dir: Path, preset: RenderPreset) -> RenderJob:
    project = load_project(project_dir)
    render_id = _new_render_id()
    output_path = _output_path(project_dir, preset, render_id)
    started_at = datetime.now(UTC)
    insert_render(
        render_id=render_id,
        project_path=project_dir,
        output_path=output_path,
        preset=preset,
        started_at=started_at,
    )
    return RenderJob(
        render_id=render_id,
        project_dir=project_dir,
        project=project,
        preset=preset,
        output_path=output_path,
        started_at=started_at,
    )


async def _run_job(job: RenderJob, *, raise_errors: bool) -> None:
    timer = time.perf_counter()

    try:
        await _emit(job.render_id, "cache_warm", 1.0, message="verifying cache")
        alignment = await _ensure_alignment(job.project_dir, job.project)
        preset_config = PRESETS[job.preset]
        await _warm_clip_cache(
            project_dir=job.project_dir,
            project=job.project,
            resolution=preset_config.resolution,
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
        )
        await _run_ffmpeg(
            _with_progress(command),
            job.output_path,
            render_id=job.render_id,
            total_s=_alignment_duration_s(alignment),
        )
        await _emit(job.render_id, "muxing", 98.0, message="muxing audio")
    except asyncio.CancelledError:
        message = "Render canceled."
        partial_path = _preserve_partial(job.output_path)
        mark_render_failed(
            render_id=job.render_id,
            finished_at=datetime.now(UTC),
            message=message,
            output_path=partial_path,
        )
        await _emit(job.render_id, "error", 0.0, message=message)
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
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    if proc.stdout is None or proc.stderr is None:
        raise RenderError(500, "FFMPEG_FAILED", "ffmpeg progress pipes were not available.")

    stderr_task = asyncio.create_task(proc.stderr.read())
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
        stderr = await stderr_task
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
        detail = stderr.decode(errors="replace").strip()
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")


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


def _new_render_id() -> str:
    return f"r-{datetime.now(UTC).strftime('%Y-%m-%d-%H%M')}-{secrets.token_hex(3)}"


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
