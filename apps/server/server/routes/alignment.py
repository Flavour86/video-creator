"""Forced alignment endpoint with content-hash cache."""

from __future__ import annotations

from pathlib import Path

import structlog
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from server.domain.project import load_project
from server.domain.timing import AlignmentResult
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment
from server.pipeline.srt import write_srt

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
    vc_dir = project_dir / ".vc"
    alignment_file = vc_dir / "alignment.json"
    hash_file = vc_dir / "alignment.hash"

    if not force and alignment_file.exists() and hash_file.exists():
        current_hash = compute_alignment_hash(audio_path, transcript_text)
        if hash_file.read_text(encoding="utf-8").strip() == current_hash:
            cached = AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))
            write_srt(project_dir, cached, max_line_chars=_subtitle_max_line_chars(proj))
            return AlignmentResult(
                sentences=cached.sentences,
                words=cached.words,
                cache_hit=True,
            )

    _in_progress.add(project)
    try:
        from server.pipeline.transcribe import align

        sentences = segment(transcript_text)
        result = await align(audio_path, sentences)

        vc_dir.mkdir(parents=True, exist_ok=True)
        alignment_file.write_text(result.model_dump_json(), encoding="utf-8")
        write_srt(project_dir, result, max_line_chars=_subtitle_max_line_chars(proj))
        hash_file.write_text(
            compute_alignment_hash(audio_path, transcript_text),
            encoding="utf-8",
        )

        if result.sentences:
            avg_conf = sum(s.confidence_avg for s in result.sentences) / len(result.sentences)
            if avg_conf < 0.3:
                log.warning("alignment.low_confidence", confidence=avg_conf, project=project)
                return _error(
                    422,
                    "LOW_CONFIDENCE",
                    (
                        f"Alignment confidence is very low ({avg_conf:.2f}). "
                        "Verify transcript matches audio."
                    ),
                    {"confidence": f"{avg_conf:.2f}"},
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


def _subtitle_max_line_chars(project: object) -> int:
    subtitles = getattr(project, "subtitles", None)
    style = getattr(subtitles, "style", None)
    max_chars = getattr(style, "max_chars_per_line", None)
    if not isinstance(max_chars, int):
        return 42
    return max(20, min(80, max_chars))
