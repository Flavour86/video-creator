"""Render orchestration for draft and final compose jobs."""
from __future__ import annotations

import asyncio
import secrets
import time
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


class RenderResult(BaseModel):
    render_id: str
    output_path: Path


class RenderError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


async def render_project(*, project_dir: Path, preset: RenderPreset) -> RenderResult:
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
    timer = time.perf_counter()

    try:
        alignment = await _ensure_alignment(project_dir, project)
        preset_config = PRESETS[preset]
        await _warm_clip_cache(
            project_dir=project_dir,
            project=project,
            resolution=preset_config.resolution,
            fps=preset_config.fps,
            crf=preset_config.crf,
        )
        command = build_compose_command(
            project_dir=project_dir,
            project=project,
            alignment=alignment,
            output_path=output_path,
            preset=preset,
        )
        await _run_ffmpeg(_with_progress(command), output_path)
    except RenderError as exc:
        mark_render_failed(render_id=render_id, finished_at=datetime.now(UTC), message=exc.message)
        _discard_partial(output_path)
        raise
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        mark_render_failed(render_id=render_id, finished_at=datetime.now(UTC), message=message)
        _discard_partial(output_path)
        raise RenderError(500, "RENDER_FAILED", message) from exc

    mark_render_finished(
        render_id=render_id,
        finished_at=datetime.now(UTC),
        duration_s=time.perf_counter() - timer,
    )
    return RenderResult(render_id=render_id, output_path=output_path)


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
            return AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))

    from server.pipeline.transcribe import align  # lazy import keeps unit tests light

    result = await align(audio_path, segment(transcript_text))
    vc_dir.mkdir(parents=True, exist_ok=True)
    alignment_file.write_text(result.model_dump_json(), encoding="utf-8")
    hash_file.write_text(current_hash, encoding="utf-8")
    return result


async def _warm_clip_cache(
    *,
    project_dir: Path,
    project: Project,
    resolution: str,
    fps: int,
    crf: int,
) -> None:
    for item in visual_items_bottom_to_top(project):
        await asyncio.to_thread(
            render_clip_to_cache,
            item=item,
            project_dir=project_dir,
            resolution=resolution,
            fps=fps,
            crf=crf,
        )


async def _run_ffmpeg(command: list[str], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip()
        raise RenderError(500, "FFMPEG_FAILED", detail or "ffmpeg failed.")
    if not output_path.is_file() or output_path.stat().st_size == 0:
        raise RenderError(500, "OUTPUT_MISSING", "ffmpeg did not produce an output file.")


def _with_progress(command: list[str]) -> list[str]:
    return [*command[:2], "-progress", "pipe:1", "-nostats", *command[2:]]


def _new_render_id() -> str:
    return f"r-{datetime.now(UTC).strftime('%Y-%m-%d-%H%M')}-{secrets.token_hex(3)}"


def _output_path(project_dir: Path, preset: RenderPreset, render_id: str) -> Path:
    if preset == "draft":
        return project_dir / ".vc" / "drafts" / f"{render_id}.mp4"
    return project_dir / "renders" / f"{render_id}.mp4"


def _discard_partial(output_path: Path) -> None:
    if output_path.exists():
        output_path.unlink()
