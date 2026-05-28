"""Forced alignment endpoint with content-hash cache."""

from __future__ import annotations

from pathlib import Path

import structlog
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from server.domain.project import load_project
from server.domain.timing import AlignmentResult
from server.pipeline.cache import (
    alignment_language_for_text,
    compute_alignment_hash,
)
from server.pipeline.srt import write_transcript_corrected_srt_file

log = structlog.get_logger()
router = APIRouter(tags=["alignment"])

_in_progress: set[str] = set()


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


@router.post("/projects/align", response_model=AlignmentResult)
async def run_alignment(
    project: str = Query(...),
    force: bool = Query(False),
) -> AlignmentResult | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    if project in _in_progress:
        return _error(
            409,
            "ALIGNMENT_IN_PROGRESS",
            "Alignment already running for this project.",
            {"project": project},
        )

    proj = load_project(project_dir)
    audio_rel = getattr(proj, "audio", "")
    if not audio_rel:
        return _error(
            404,
            "AUDIO_NOT_FOUND",
            "No audio file set in project.json.",
            {"project": project},
        )

    audio_path = project_dir / audio_rel
    if not audio_path.exists():
        return _error(
            404,
            "AUDIO_NOT_FOUND",
            "Audio file not found on disk.",
            {"path": str(audio_path)},
        )

    transcript_rel = getattr(proj.transcript, "path", "transcript.txt")
    transcript_path = project_dir / transcript_rel
    if not transcript_path.exists():
        return _error(
            404,
            "TRANSCRIPT_NOT_FOUND",
            "Transcript file not found.",
            {"path": str(transcript_path)},
        )

    transcript_text = transcript_path.read_text(encoding="utf-8")
    alignment_language = alignment_language_for_text(transcript_text)
    subtitles_path = project_dir / "subtitles.srt"
    if not subtitles_path.exists():
        return _error(
            404,
            "SUBTITLES_NOT_FOUND",
            "Generated subtitles.srt was not found.",
            {"path": str(subtitles_path)},
        )
    vc_dir = project_dir / ".vc"
    alignment_file = vc_dir / "alignment.json"
    hash_file = vc_dir / "alignment.hash"

    if not force and alignment_file.exists() and hash_file.exists():
        current_hash = compute_alignment_hash(
            audio_path,
            transcript_text,
            language=alignment_language,
        )
        if hash_file.read_text(encoding="utf-8").strip() == current_hash:
            correction = write_transcript_corrected_srt_file(subtitles_path, transcript_text)
            alignment_file.write_text(correction.alignment.model_dump_json(), encoding="utf-8")
            return AlignmentResult(
                sentences=correction.alignment.sentences,
                words=correction.alignment.words,
                cache_hit=True,
            )

    _in_progress.add(project)
    try:
        correction = write_transcript_corrected_srt_file(subtitles_path, transcript_text)
        result = correction.alignment

        vc_dir.mkdir(parents=True, exist_ok=True)
        alignment_file.write_text(result.model_dump_json(), encoding="utf-8")
        hash_file.write_text(
            compute_alignment_hash(audio_path, transcript_text, language=alignment_language),
            encoding="utf-8",
        )
    finally:
        _in_progress.discard(project)

    return result


@router.get("/projects/align", response_model=AlignmentResult)
async def get_alignment(project: str = Query(...)) -> AlignmentResult | JSONResponse:
    alignment_file = Path(project) / ".vc" / "alignment.json"
    if not alignment_file.exists():
        return _error(
            404,
            "NO_ALIGNMENT",
            "No alignment found for this project.",
            {"project": project},
        )
    return AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))

