from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import shutil
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, File, Query, Request, Response, UploadFile, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from schemas import (  # type: ignore[import-not-found]
    DetectedTranscript,
    DetectedVoice,
    SetupAlignment,
    SetupDraft,
    SetupOutputPreset,
    SetupSubtitleCacheState,
    SetupSubtitleGenerationResult,
    SetupSubtitleGenerationState,
)

from server.db.projects import project_path_for_id, touch_recent
from server.domain.project import DetectedInputs, Project, ensure_project_layout
from server.domain.timing import AlignmentResult
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment
from server.pipeline.srt import subtitle_stats, write_aligned_srt_file, write_srt_file
from server.settings import app_root, settings

router = APIRouter(prefix="/setup", tags=["setup"])
subtitle_router = APIRouter(tags=["subtitle"])

SUPPORTED_SUBTITLE_VOICE_SUFFIXES = {".mp3", ".wav", ".m4a"}
SUPPORTED_TRANSCRIPT_SUFFIXES = {".txt", ".md", ".srt"}
SUPPORTED_WATERMARK_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SETUP_SESSION_COOKIE = "vc_setup_id"
ArtifactKind = Literal["voice", "transcript", "watermark"]


class ScaffoldRequest(BaseModel):
    path: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    output_preset: SetupOutputPreset = SetupOutputPreset.final
    force: bool = False


class SetupDraftCreateRequest(BaseModel):
    path: str | None = Field(default=None, min_length=1)
    name: str = Field(default="", max_length=200)
    output_preset: SetupOutputPreset = SetupOutputPreset.final


class SetupDraftUpdateRequest(BaseModel):
    path: str | None = None
    name: str | None = Field(default=None, max_length=200)
    output_preset: SetupOutputPreset | None = None
    voice_path: str | None = None
    transcript_path: str | None = None
    watermark_path: str | None = None
    subtitles_path: str | None = None
    subtitle_generation: SetupSubtitleGenerationResult | None = None
    alignment: SetupAlignment | None = None
    alignment_result: dict[str, Any] | None = None


class SubtitleGenerateRequest(BaseModel):
    setup_id: str | None = None
    project_id: str | None = None
    path: str | None = None
    voice_path: str | None = None


class SubtitleAlignmentRequest(BaseModel):
    setup_id: str


class SubtitleAlignmentResponse(BaseModel):
    status: Literal["ready", "running", "succeeded", "failed"]
    corrections_applied: int = 0
    alignment: SetupAlignment
    error_code: str | None = None
    error_message: str | None = None


class RecoverableAlignmentError(RuntimeError):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class SetupDraftArtifacts(BaseModel):
    voice_source_path: str | None = None
    voice_path: str | None = None
    transcript_source_path: str | None = None
    transcript_path: str | None = None
    subtitles_path: str | None = None
    watermark_source_path: str | None = None
    watermark_path: str | None = None
    alignment_path: str | None = None


class SetupDraftSession(BaseModel):
    setup_id: str
    draft: SetupDraft
    artifacts: SetupDraftArtifacts


def _default_setup_subtitle_generation() -> SetupSubtitleGenerationResult:
    return SetupSubtitleGenerationResult(
        status=SetupSubtitleGenerationState.ready,
        cue_count=0,
        total_duration_s=0.0,
        cache_state=SetupSubtitleCacheState.unknown,
        error_message=None,
    )


def _default_setup_alignment() -> SetupAlignment:
    return SetupAlignment(
        status="pending",
        hash="",
        device="cuda fp16",
        model="large-v3",
        audio_duration=0.0,
        cache_hit=False,
    )


def set_setup_session_cookie(response: Response, setup_id: str) -> None:
    response.set_cookie(
        SETUP_SESSION_COOKIE,
        setup_id,
        httponly=True,
        max_age=60 * 60 * 24,
        path="/",
        samesite="lax",
    )


def clear_setup_session_cookie(response: Response) -> None:
    response.delete_cookie(SETUP_SESSION_COOKIE, path="/")


def _alignment_response(
    *,
    status: Literal["ready", "running", "succeeded", "failed"],
    alignment: SetupAlignment,
    corrections_applied: int = 0,
    error_code: str | None = None,
    error_message: str | None = None,
) -> SubtitleAlignmentResponse:
    return SubtitleAlignmentResponse(
        status=status,
        corrections_applied=corrections_applied,
        alignment=alignment,
        error_code=error_code,
        error_message=error_message,
    )


def _is_cuda_related_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "cuda" in message or "cudnn" in message


def _is_cuda_oom_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "cuda out of memory" in message or (
        "out of memory" in message and "cuda" in message
    )


def _recoverable_alignment_error(exc: Exception) -> tuple[int, str, str]:
    if isinstance(exc, RecoverableAlignmentError):
        return (exc.status_code, exc.code, exc.message)
    if isinstance(exc, (ImportError, ModuleNotFoundError)) and "whisperx" in str(exc).lower():
        return (
            503,
            "WHISPERX_UNAVAILABLE",
            "WhisperX is unavailable. Install WhisperX and retry alignment.",
        )

    message = str(exc).lower()
    if _is_cuda_oom_error(exc):
        return (
            422,
            "CUDA_OOM",
            "CUDA ran out of memory while aligning subtitles.",
        )
    if _is_cuda_related_error(exc):
        return (
            422,
            "CUDA_UNAVAILABLE",
            "CUDA is unavailable for alignment. Retry on CPU.",
        )
    if "silence" in message:
        return (
            422,
            "LONG_SILENCE",
            "Alignment could not lock timestamps because the voice track contains long silence.",
        )
    if (
        "mismatch" in message
        or "low confidence" in message
        or "does not match" in message
        or "verify transcript and voice match" in message
    ):
        return (
            422,
            "MISMATCHED_TEXT",
            "Transcript text does not match the spoken audio closely enough for alignment.",
        )
    return (500, "SUBTITLE_ALIGNMENT_FAILED", "Subtitle alignment failed.")


def _alignment_quality_error(result: AlignmentResult) -> tuple[int, str, str] | None:
    if not result.words:
        return (
            422,
            "LONG_SILENCE",
            "Alignment produced no timed words. Check for long silence in the voice track.",
        )
    if not result.sentences:
        return (
            422,
            "MISMATCHED_TEXT",
            "Alignment produced no sentence timings. Verify transcript and voice match.",
        )
    avg_confidence = (
        sum(sentence.confidence_avg for sentence in result.sentences)
        / len(result.sentences)
    )
    if avg_confidence < 0.3:
        return (
            422,
            "MISMATCHED_TEXT",
            (
                f"Alignment confidence is very low ({avg_confidence:.2f}). "
                "Verify transcript matches audio."
            ),
        )
    return None


class _SetupDraftRecord(BaseModel):
    setup_id: str
    path: str
    name: str
    output_preset: SetupOutputPreset
    voice_source_path: str | None = None
    voice_staged_path: str | None = None
    transcript_source_path: str | None = None
    transcript_staged_path: str | None = None
    subtitles_staged_path: str | None = None
    watermark_source_path: str | None = None
    watermark_staged_path: str | None = None
    alignment_staged_path: str | None = None
    subtitle_generation: SetupSubtitleGenerationResult = Field(
        default_factory=_default_setup_subtitle_generation
    )
    alignment: SetupAlignment = Field(default_factory=_default_setup_alignment)


@dataclass(frozen=True)
class _SubtitleTarget:
    voice_path: Path
    subtitles_path: Path
    hash_path: Path
    metadata_path: Path
    setup_record: _SetupDraftRecord | None = None


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def _setup_cache_root() -> Path:
    root = settings.app_db_path.parent / "setup-cache"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _is_valid_setup_id(setup_id: str) -> bool:
    return (
        setup_id.startswith("setup_")
        and len(setup_id) > 6
        and setup_id.replace("_", "").isalnum()
    )


def _setup_draft_dir(setup_id: str) -> Path:
    if not _is_valid_setup_id(setup_id):
        raise ValueError("Invalid setup id.")
    cache_root = _setup_cache_root().resolve()
    draft_dir = (cache_root / setup_id).resolve(strict=False)
    if not draft_dir.is_relative_to(cache_root):
        raise ValueError("Invalid setup id.")
    return draft_dir


def _setup_artifacts_dir(setup_id: str) -> Path:
    artifacts_dir = _setup_draft_dir(setup_id) / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    return artifacts_dir


def _setup_record_path(setup_id: str) -> Path:
    return _setup_draft_dir(setup_id) / "draft.json"


def _is_valid_draft_project_path(path_value: str) -> bool:
    draft_path = Path(path_value)
    return draft_path.is_absolute() and draft_path.parent.is_dir()


def _invalid_draft_project_path_response(path_value: str) -> JSONResponse:
    return _error(
        400,
        "INVALID_PATH",
        "Draft project path must be absolute and its parent directory must exist.",
        {"path": path_value},
    )


def _safe_project_folder_name(name: str) -> str:
    cleaned = "".join(
        char if char.isalnum() or char in {" ", "-", "_"} else "-"
        for char in name.strip()
    )
    normalized = "-".join(cleaned.split()).strip("-_")
    return normalized or "untitled-project"


def _default_draft_project_path(name: str) -> str:
    projects_root = app_root() / "projects"
    projects_root.mkdir(parents=True, exist_ok=True)
    return str(projects_root / _safe_project_folder_name(name))


def _new_setup_id() -> str:
    return f"setup_{secrets.token_hex(8)}"


def _load_setup_draft_record(setup_id: str) -> _SetupDraftRecord | None:
    if not _is_valid_setup_id(setup_id):
        return None
    record_path = _setup_record_path(setup_id)
    if not record_path.is_file():
        return None
    try:
        return _SetupDraftRecord.model_validate_json(record_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_setup_draft_record(record: _SetupDraftRecord) -> None:
    draft_dir = _setup_draft_dir(record.setup_id)
    draft_dir.mkdir(parents=True, exist_ok=True)
    _setup_artifacts_dir(record.setup_id)
    payload = json.dumps(record.model_dump(mode="json"), indent=2)
    _setup_record_path(record.setup_id).write_text(payload, encoding="utf-8")


def _clear_staged_file(setup_id: str, path_value: str | None) -> None:
    if path_value is None:
        return
    try:
        draft_dir = _setup_draft_dir(setup_id).resolve()
        target = Path(path_value).resolve(strict=False)
    except OSError:
        return

    if not target.is_relative_to(draft_dir):
        return
    if not target.is_file():
        return
    try:
        target.unlink()
    except OSError as exc:
        raise ValueError("Could not remove staged setup artifact.") from exc


def _validate_source_file(path_value: str) -> Path:
    source = Path(path_value)
    if not source.is_absolute():
        raise ValueError("Staged source path must be absolute.")
    if not source.is_file():
        raise ValueError(f"Staged source file does not exist: {path_value}")
    return source


def _stage_copy(source_path: str, destination: Path) -> str:
    source = _validate_source_file(source_path)
    temp_path = destination.parent / f".{destination.name}.{secrets.token_hex(6)}.staging"
    try:
        source_resolved = source.resolve(strict=True)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination_resolved = destination.resolve(strict=False)
        if source_resolved == destination_resolved:
            return str(destination)
        shutil.copy2(source, temp_path)
        os.replace(temp_path, destination)
    except shutil.SameFileError:
        return str(destination)
    except OSError as exc:
        raise ValueError("Could not copy setup draft artifact.") from exc
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
    return str(destination)


def _apply_staged_path(
    record: _SetupDraftRecord,
    *,
    source_value: str | None,
    source_attr: str,
    staged_attr: str,
    destination: Path,
) -> None:
    staged_before = getattr(record, staged_attr)
    if source_value is None:
        _clear_staged_file(record.setup_id, staged_before)
        setattr(record, source_attr, None)
        setattr(record, staged_attr, None)
        return

    staged_path = _stage_copy(source_value, destination)
    if staged_before is not None and staged_before != staged_path:
        _clear_staged_file(record.setup_id, staged_before)
    setattr(record, source_attr, source_value)
    setattr(record, staged_attr, staged_path)


def _apply_setup_draft_update(record: _SetupDraftRecord, payload: SetupDraftUpdateRequest) -> None:
    if "path" in payload.model_fields_set and payload.path is not None:
        record.path = payload.path
    if "name" in payload.model_fields_set and payload.name is not None:
        record.name = payload.name
        if "path" not in payload.model_fields_set:
            record.path = _default_draft_project_path(payload.name)
    if "output_preset" in payload.model_fields_set and payload.output_preset is not None:
        record.output_preset = payload.output_preset

    artifacts_dir = _setup_artifacts_dir(record.setup_id)
    if "voice_path" in payload.model_fields_set:
        voice_source = payload.voice_path
        voice_suffix = ".wav"
        if voice_source is not None:
            voice_suffix = Path(voice_source).suffix.lower() or ".wav"
        _apply_staged_path(
            record,
            source_value=voice_source,
            source_attr="voice_source_path",
            staged_attr="voice_staged_path",
            destination=artifacts_dir / f"voice{voice_suffix}",
        )
    if "transcript_path" in payload.model_fields_set:
        transcript_source = payload.transcript_path
        transcript_suffix = ".txt"
        if transcript_source is not None:
            transcript_suffix = Path(transcript_source).suffix.lower() or ".txt"
        _apply_staged_path(
            record,
            source_value=transcript_source,
            source_attr="transcript_source_path",
            staged_attr="transcript_staged_path",
            destination=artifacts_dir / f"transcript{transcript_suffix}",
        )
    if "watermark_path" in payload.model_fields_set:
        watermark_source = payload.watermark_path
        watermark_suffix = ".png"
        if watermark_source is not None:
            watermark_suffix = Path(watermark_source).suffix.lower() or ".png"
        _apply_staged_path(
            record,
            source_value=watermark_source,
            source_attr="watermark_source_path",
            staged_attr="watermark_staged_path",
            destination=artifacts_dir / f"watermark{watermark_suffix}",
        )
    if "subtitles_path" in payload.model_fields_set:
        subtitles_source = payload.subtitles_path
        if subtitles_source is None:
            _clear_staged_file(record.setup_id, record.subtitles_staged_path)
            record.subtitles_staged_path = None
        else:
            record.subtitles_staged_path = _stage_copy(
                subtitles_source,
                artifacts_dir / "subtitles.srt",
            )

    if (
        "subtitle_generation" in payload.model_fields_set
        and payload.subtitle_generation is not None
    ):
        record.subtitle_generation = payload.subtitle_generation
    if "alignment" in payload.model_fields_set and payload.alignment is not None:
        record.alignment = payload.alignment
    if "alignment_result" in payload.model_fields_set:
        if payload.alignment_result is None:
            _clear_staged_file(record.setup_id, record.alignment_staged_path)
            record.alignment_staged_path = None
        else:
            alignment_path = artifacts_dir / "alignment.json"
            alignment_path.write_text(
                json.dumps(payload.alignment_result, indent=2),
                encoding="utf-8",
            )
            record.alignment_staged_path = str(alignment_path)


def _reset_setup_pipeline_state(record: _SetupDraftRecord) -> None:
    record.subtitle_generation = _default_setup_subtitle_generation()
    record.alignment = _default_setup_alignment()
    _clear_staged_file(record.setup_id, record.subtitles_staged_path)
    record.subtitles_staged_path = None
    _clear_staged_file(record.setup_id, record.alignment_staged_path)
    record.alignment_staged_path = None


def _sanitize_artifact_filename(filename: str | None, fallback: str) -> str:
    if not filename:
        return fallback
    cleaned = Path(filename).name.strip()
    return cleaned or fallback


async def _stage_upload_file(file: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.parent / f".{destination.name}.{secrets.token_hex(6)}.uploading"
    try:
        with temp_path.open("wb") as handle:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        os.replace(temp_path, destination)
    finally:
        await file.close()
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)


def _setup_draft_session(record: _SetupDraftRecord) -> SetupDraftSession:
    voice_path = Path(record.voice_staged_path) if record.voice_staged_path is not None else None
    transcript_path = (
        Path(record.transcript_staged_path) if record.transcript_staged_path is not None else None
    )

    voice = _detect_voice(voice_path) if voice_path is not None else None
    transcript = _detect_transcript(transcript_path) if transcript_path is not None else None
    alignment = record.alignment
    if voice is not None and alignment.audio_duration <= 0:
        alignment = alignment.model_copy(update={"audio_duration": voice.duration})

    draft = SetupDraft(
        project_id=None,
        path=record.path,
        name=record.name,
        output_preset=record.output_preset,
        voice=voice,
        transcript=transcript,
        subtitle_generation=record.subtitle_generation,
        alignment=alignment,
    )
    artifacts = SetupDraftArtifacts(
        voice_source_path=record.voice_source_path,
        voice_path=record.voice_staged_path,
        transcript_source_path=record.transcript_source_path,
        transcript_path=record.transcript_staged_path,
        subtitles_path=record.subtitles_staged_path,
        watermark_source_path=record.watermark_source_path,
        watermark_path=record.watermark_staged_path,
        alignment_path=record.alignment_staged_path,
    )
    return SetupDraftSession(setup_id=record.setup_id, draft=draft, artifacts=artifacts)


@router.post("/drafts", response_model=SetupDraftSession)
async def create_setup_draft(
    payload: SetupDraftCreateRequest,
    response: Response,
) -> SetupDraftSession | JSONResponse:
    path = payload.path or _default_draft_project_path(payload.name)
    if not _is_valid_draft_project_path(path):
        return _invalid_draft_project_path_response(path)
    setup_id = _new_setup_id()
    record = _SetupDraftRecord(
        setup_id=setup_id,
        path=path,
        name=payload.name,
        output_preset=payload.output_preset,
    )
    _save_setup_draft_record(record)
    set_setup_session_cookie(response, setup_id)
    return _setup_draft_session(record)


@router.get("/drafts/{setup_id}", response_model=SetupDraftSession)
def get_setup_draft(setup_id: str) -> SetupDraftSession | JSONResponse:
    record = _load_setup_draft_record(setup_id)
    if record is None:
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )
    return _setup_draft_session(record)


@router.patch("/drafts/{setup_id}", response_model=SetupDraftSession)
async def patch_setup_draft(
    setup_id: str,
    payload: SetupDraftUpdateRequest,
) -> SetupDraftSession | JSONResponse:
    record = _load_setup_draft_record(setup_id)
    if record is None:
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )

    if (
        "path" in payload.model_fields_set
        and payload.path is not None
        and not _is_valid_draft_project_path(payload.path)
    ):
        return _invalid_draft_project_path_response(payload.path)

    try:
        _apply_setup_draft_update(record, payload)
    except ValueError as exc:
        return _error(
            400,
            "INVALID_STAGED_FILE",
            "Setup draft artifact staging failed.",
            {"error": str(exc)},
        )

    _save_setup_draft_record(record)
    return _setup_draft_session(record)


@router.post("/drafts/{setup_id}/artifacts/{kind}", response_model=SetupDraftSession)
async def upload_setup_draft_artifact(
    setup_id: str,
    kind: ArtifactKind,
    file: Annotated[UploadFile, File()],
) -> SetupDraftSession | JSONResponse:
    record = _load_setup_draft_record(setup_id)
    if record is None:
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )

    suffix = Path(file.filename or "").suffix.lower()
    try:
        if kind == "voice":
            if suffix not in SUPPORTED_SUBTITLE_VOICE_SUFFIXES:
                return _error(
                    415,
                    "UNSUPPORTED_VOICE_CODEC",
                    "Voice upload accepts .mp3, .wav, or .m4a files.",
                    {"filename": file.filename or ""},
                )
            destination = _setup_artifacts_dir(record.setup_id) / f"voice{suffix or '.wav'}"
            previous_staged = record.voice_staged_path
            record.voice_source_path = _sanitize_artifact_filename(file.filename, destination.name)
            await _stage_upload_file(file, destination)
            record.voice_staged_path = str(destination)
            if previous_staged is not None and previous_staged != record.voice_staged_path:
                _clear_staged_file(record.setup_id, previous_staged)
            _reset_setup_pipeline_state(record)
        elif kind == "transcript":
            if suffix and suffix not in SUPPORTED_TRANSCRIPT_SUFFIXES:
                return _error(
                    415,
                    "UNSUPPORTED_TRANSCRIPT_FORMAT",
                    "Transcript upload accepts .txt, .md, or .srt files.",
                    {"filename": file.filename or ""},
                )
            destination = _setup_artifacts_dir(record.setup_id) / f"transcript{suffix or '.txt'}"
            previous_staged = record.transcript_staged_path
            record.transcript_source_path = _sanitize_artifact_filename(
                file.filename,
                destination.name,
            )
            await _stage_upload_file(file, destination)
            record.transcript_staged_path = str(destination)
            if previous_staged is not None and previous_staged != record.transcript_staged_path:
                _clear_staged_file(record.setup_id, previous_staged)
            record.alignment = _default_setup_alignment()
            _clear_staged_file(record.setup_id, record.alignment_staged_path)
            record.alignment_staged_path = None
        else:
            if suffix and suffix not in SUPPORTED_WATERMARK_SUFFIXES:
                return _error(
                    415,
                    "UNSUPPORTED_WATERMARK_FORMAT",
                    "Watermark upload accepts .png, .jpg, .jpeg, or .webp files.",
                    {"filename": file.filename or ""},
                )
            destination = _setup_artifacts_dir(record.setup_id) / f"watermark{suffix or '.png'}"
            previous_staged = record.watermark_staged_path
            record.watermark_source_path = _sanitize_artifact_filename(
                file.filename,
                destination.name,
            )
            await _stage_upload_file(file, destination)
            record.watermark_staged_path = str(destination)
            if previous_staged is not None and previous_staged != record.watermark_staged_path:
                _clear_staged_file(record.setup_id, previous_staged)
    except OSError as exc:
        return _error(
            500,
            "SETUP_ARTIFACT_UPLOAD_FAILED",
            "Uploading setup artifact failed.",
            {"error": str(exc)},
        )

    _save_setup_draft_record(record)
    return _setup_draft_session(record)


@router.delete("/drafts/{setup_id}", response_model=None)
async def delete_setup_draft(
    setup_id: str,
    request: Request,
    response: Response,
) -> dict[str, bool] | JSONResponse:
    if not _is_valid_setup_id(setup_id):
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )
    draft_dir = _setup_draft_dir(setup_id)
    if not draft_dir.is_dir():
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )
    shutil.rmtree(draft_dir)
    if request.cookies.get(SETUP_SESSION_COOKIE) == setup_id:
        clear_setup_session_cookie(response)
    return {"ok": True}


@subtitle_router.post("/subtitle", response_model=SetupSubtitleGenerationResult)
async def generate_subtitle(
    payload: SubtitleGenerateRequest,
) -> SetupSubtitleGenerationResult | JSONResponse:
    target_or_error = _resolve_subtitle_target(payload)
    if isinstance(target_or_error, JSONResponse):
        return target_or_error

    target = target_or_error
    voice_error = _validate_subtitle_voice(target.voice_path)
    if voice_error is not None:
        _save_failed_subtitle_generation(target, "Unsupported or missing voice file.")
        return voice_error

    running = SetupSubtitleGenerationResult(
        status=SetupSubtitleGenerationState.running,
        cue_count=0,
        total_duration_s=0.0,
        cache_state=SetupSubtitleCacheState.unknown,
        error_message=None,
    )
    _save_subtitle_generation(target, running)
    try:
        from server.pipeline import transcribe

        voice_hash = _file_sha256(target.voice_path)
        cached = _cached_subtitle_generation(target, voice_hash)
        if cached is not None:
            return cached

        alignment = await transcribe.transcribe_audio(target.voice_path)
        target.subtitles_path.parent.mkdir(parents=True, exist_ok=True)
        write_srt_file(target.subtitles_path, alignment)
        stats = subtitle_stats(alignment)
        result = SetupSubtitleGenerationResult(
            status=SetupSubtitleGenerationState.succeeded,
            cue_count=stats.cue_count,
            total_duration_s=stats.total_duration_s,
            cache_state=SetupSubtitleCacheState.miss,
            error_message=None,
        )
        target.hash_path.parent.mkdir(parents=True, exist_ok=True)
        target.hash_path.write_text(voice_hash, encoding="utf-8")
        _write_subtitle_metadata(target.metadata_path, result)
        _save_subtitle_generation(target, result)
        return result
    except Exception as exc:
        failed = _save_failed_subtitle_generation(target, str(exc))
        return _error(
            500,
            "SUBTITLE_GENERATION_FAILED",
            "Subtitle generation failed.",
            {"error": failed.error_message or "unknown"},
        )


@subtitle_router.post("/subtitle/alignment", response_model=SubtitleAlignmentResponse)
async def run_setup_alignment(
    payload: SubtitleAlignmentRequest,
) -> SubtitleAlignmentResponse | JSONResponse:
    record = _load_setup_draft_record(payload.setup_id)
    if record is None:
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": payload.setup_id},
        )
    if not record.name.strip():
        return _alignment_response(
            status="ready",
            alignment=record.alignment,
            error_code="PROJECT_NAME_REQUIRED",
            error_message="Enter a project name before running alignment.",
        )
    if record.voice_staged_path is None:
        return _alignment_response(
            status="ready",
            alignment=record.alignment,
            error_code="VOICE_NOT_SELECTED",
            error_message="Select a voice file before running alignment.",
        )
    if record.transcript_staged_path is None:
        return _alignment_response(
            status="ready",
            alignment=record.alignment,
            error_code="TRANSCRIPT_NOT_SELECTED",
            error_message="Select a transcript file before running alignment.",
        )
    if record.subtitles_staged_path is None:
        return _alignment_response(
            status="ready",
            alignment=record.alignment,
            error_code="SUBTITLE_NOT_GENERATED",
            error_message="Generate subtitles before running alignment.",
        )
    if record.subtitle_generation.status != SetupSubtitleGenerationState.succeeded:
        return _alignment_response(
            status="ready",
            alignment=record.alignment,
            error_code="SUBTITLE_NOT_READY",
            error_message="Generate subtitles successfully before running alignment.",
        )
    if record.alignment.status == "running":
        return _alignment_response(status="running", alignment=record.alignment)

    voice_path = Path(record.voice_staged_path)
    transcript_path = Path(record.transcript_staged_path)
    subtitles_path = Path(record.subtitles_staged_path)
    if not voice_path.is_file():
        record.alignment = record.alignment.model_copy(
            update={"status": "failed", "error": "Voice file not found."}
        )
        _save_setup_draft_record(record)
        return _alignment_response(
            status="failed",
            alignment=record.alignment,
            error_code="VOICE_NOT_SELECTED",
            error_message="Select a voice file before running alignment.",
        )
    if not transcript_path.is_file():
        record.alignment = record.alignment.model_copy(
            update={"status": "failed", "error": "Transcript file not found."}
        )
        _save_setup_draft_record(record)
        return _alignment_response(
            status="failed",
            alignment=record.alignment,
            error_code="TRANSCRIPT_NOT_SELECTED",
            error_message="Select a transcript file before running alignment.",
        )
    if not subtitles_path.is_file():
        record.alignment = record.alignment.model_copy(
            update={"status": "failed", "error": "Generated subtitles are missing."}
        )
        _save_setup_draft_record(record)
        return _alignment_response(
            status="failed",
            alignment=record.alignment,
            error_code="SUBTITLE_NOT_GENERATED",
            error_message="Generate subtitles before running alignment.",
        )
    transcript_text = transcript_path.read_text(encoding="utf-8")
    if not transcript_text.strip():
        record.alignment = record.alignment.model_copy(
            update={"status": "failed", "error": "Transcript file is empty."}
        )
        _save_setup_draft_record(record)
        return _alignment_response(
            status="failed",
            alignment=record.alignment,
            error_code="TRANSCRIPT_EMPTY",
            error_message="Transcript file is empty.",
        )

    voice = _detect_voice(voice_path)
    audio_duration = voice.duration if voice is not None else 0.0
    current_hash = compute_alignment_hash(voice_path, transcript_text)
    draft_dir = _setup_draft_dir(record.setup_id)
    alignment_hash_path = draft_dir / "alignment.hash"
    alignment_path = _setup_artifacts_dir(record.setup_id) / "alignment.json"
    if (
        alignment_path.is_file()
        and alignment_hash_path.is_file()
        and alignment_hash_path.read_text(encoding="utf-8").strip() == current_hash
    ):
        cached = AlignmentResult.model_validate_json(alignment_path.read_text(encoding="utf-8"))
        update = write_aligned_srt_file(subtitles_path, cached)
        record.alignment = SetupAlignment(
            status="aligned",
            hash=current_hash,
            device="cuda fp16",
            model="large-v3",
            audio_duration=audio_duration,
            cache_hit=True,
        )
        record.alignment_staged_path = str(alignment_path)
        _save_setup_draft_record(record)
        return _alignment_response(
            status="succeeded",
            corrections_applied=update.corrections_applied,
            alignment=record.alignment,
        )

    try:
        from server.pipeline.transcribe import align

        sentences = segment(transcript_text)
        if not sentences:
            record.alignment = SetupAlignment(
                status="failed",
                hash=current_hash,
                device="cuda fp16",
                model="large-v3",
                audio_duration=audio_duration,
                cache_hit=False,
                error="Transcript file is empty.",
            )
            _save_setup_draft_record(record)
            return _alignment_response(
                status="failed",
                alignment=record.alignment,
                error_code="TRANSCRIPT_EMPTY",
                error_message="Transcript file is empty.",
            )
        record.alignment = SetupAlignment(
            status="running",
            hash=current_hash,
            device="cuda fp16",
            model="large-v3",
            audio_duration=audio_duration,
            cache_hit=False,
        )
        _save_setup_draft_record(record)
        fallback_to_cpu = False
        try:
            result = await align(voice_path, sentences)
        except Exception as exc:
            if _is_cuda_related_error(exc):
                fallback_to_cpu = True
                result = await align(voice_path, sentences, device="cpu")
            else:
                raise

        quality_error = _alignment_quality_error(result)
        if quality_error is not None:
            raise RecoverableAlignmentError(*quality_error)

        alignment_path.write_text(result.model_dump_json(), encoding="utf-8")
        alignment_hash_path.write_text(current_hash, encoding="utf-8")
        update = write_aligned_srt_file(subtitles_path, result)
        record.alignment = SetupAlignment(
            status="aligned",
            hash=current_hash,
            device="cpu fp32" if fallback_to_cpu else "cuda fp16",
            model="large-v3",
            audio_duration=audio_duration,
            cache_hit=False,
        )
        record.alignment_staged_path = str(alignment_path)
        _save_setup_draft_record(record)
        return _alignment_response(
            status="succeeded",
            corrections_applied=update.corrections_applied,
            alignment=record.alignment,
        )
    except Exception as exc:
        record.alignment = SetupAlignment(
            status="failed",
            hash=current_hash,
            device="cuda fp16",
            model="large-v3",
            audio_duration=audio_duration,
            cache_hit=False,
            error=str(exc),
        )
        _save_setup_draft_record(record)
        _, code, message = _recoverable_alignment_error(exc)
        return _alignment_response(
            status="failed",
            alignment=record.alignment,
            error_code=code,
            error_message=message,
        )


def _resolve_subtitle_target(payload: SubtitleGenerateRequest) -> _SubtitleTarget | JSONResponse:
    if payload.setup_id:
        record = _load_setup_draft_record(payload.setup_id)
        if record is None:
            return _error(
                404,
                "SETUP_DRAFT_NOT_FOUND",
                "Setup draft was not found.",
                {"setup_id": payload.setup_id},
            )
        if payload.voice_path is not None:
            return _error(
                400,
                "VOICE_PATH_FORBIDDEN",
                "Use setup draft artifact upload endpoints for voice files.",
                {"setup_id": payload.setup_id},
            )
        if record.voice_staged_path is None:
            return _error(
                400,
                "VOICE_NOT_SELECTED",
                "Select a voice file before generating subtitles.",
                {"setup_id": record.setup_id},
            )
        artifacts_dir = _setup_artifacts_dir(record.setup_id)
        record.subtitles_staged_path = str(artifacts_dir / "subtitles.srt")
        return _SubtitleTarget(
            voice_path=Path(record.voice_staged_path),
            subtitles_path=Path(record.subtitles_staged_path),
            hash_path=_setup_draft_dir(record.setup_id) / "subtitle.hash",
            metadata_path=_setup_draft_dir(record.setup_id) / "subtitle.json",
            setup_record=record,
        )

    if payload.project_id:
        project_dir = project_path_for_id(payload.project_id)
        if project_dir is None:
            return _error(
                404,
                "PROJECT_NOT_FOUND",
                "Project not found.",
                {"project_id": payload.project_id},
            )
    elif payload.path:
        project_dir = Path(payload.path)
    else:
        return _error(
            400,
            "SUBTITLE_TARGET_REQUIRED",
            "Provide setup_id, project_id, or path.",
            {},
        )

    voice_path = Path(payload.voice_path) if payload.voice_path else _find_voice_file(project_dir)
    if voice_path is None:
        return _error(
            400,
            "VOICE_NOT_SELECTED",
            "Select a voice file before generating subtitles.",
            {"path": str(project_dir)},
        )
    vc_dir = project_dir / ".vc"
    return _SubtitleTarget(
        voice_path=voice_path,
        subtitles_path=project_dir / "subtitles.srt",
        hash_path=vc_dir / "subtitle.hash",
        metadata_path=vc_dir / "subtitle.json",
    )


def _validate_subtitle_voice(voice_path: Path) -> JSONResponse | None:
    if voice_path.suffix.lower() not in SUPPORTED_SUBTITLE_VOICE_SUFFIXES:
        return _error(
            415,
            "UNSUPPORTED_VOICE_CODEC",
            "Subtitle generation accepts .mp3, .wav, or .m4a voice files.",
            {"path": str(voice_path)},
        )
    voice = _detect_voice(voice_path)
    if voice is None:
        return _error(
            404,
            "VOICE_NOT_FOUND",
            "Voice file not found.",
            {"path": str(voice_path)},
        )
    if voice.state.value != "copied":
        return _error(
            422,
            "VOICE_NOT_READY",
            "Voice file is not ready for subtitle generation.",
            {"path": str(voice_path), "state": voice.state.value},
        )
    return None


def _cached_subtitle_generation(
    target: _SubtitleTarget,
    voice_hash: str,
) -> SetupSubtitleGenerationResult | None:
    try:
        if (
            not target.hash_path.is_file()
            or not target.metadata_path.is_file()
            or not target.subtitles_path.is_file()
            or target.hash_path.read_text(encoding="utf-8").strip() != voice_hash
        ):
            return None
        cached = SetupSubtitleGenerationResult.model_validate_json(
            target.metadata_path.read_text(encoding="utf-8")
        )
    except Exception:
        _invalidate_subtitle_cache(target)
        return None
    result = cached.model_copy(update={"cache_state": SetupSubtitleCacheState.hit})
    _save_subtitle_generation(target, result)
    return result


def _invalidate_subtitle_cache(target: _SubtitleTarget) -> None:
    for path in (target.hash_path, target.metadata_path):
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _save_failed_subtitle_generation(
    target: _SubtitleTarget,
    message: str,
) -> SetupSubtitleGenerationResult:
    failed = SetupSubtitleGenerationResult(
        status=SetupSubtitleGenerationState.failed,
        cue_count=0,
        total_duration_s=0.0,
        cache_state=SetupSubtitleCacheState.unknown,
        error_message=message,
    )
    _save_subtitle_generation(target, failed)
    return failed


def _save_subtitle_generation(
    target: _SubtitleTarget,
    generation: SetupSubtitleGenerationResult,
) -> None:
    if target.setup_record is None:
        return
    target.setup_record.subtitle_generation = generation
    if generation.status != SetupSubtitleGenerationState.succeeded:
        target.setup_record.alignment = _default_setup_alignment()
    _save_setup_draft_record(target.setup_record)


def _write_subtitle_metadata(
    metadata_path: Path,
    result: SetupSubtitleGenerationResult,
) -> None:
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(result.model_dump_json(), encoding="utf-8")


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


@router.post("/scaffold", response_model=DetectedInputs)
async def scaffold_setup(payload: ScaffoldRequest) -> DetectedInputs | JSONResponse:
    project_dir = Path(payload.path)
    if not project_dir.is_absolute() or not project_dir.parent.exists():
        return _error(
            400,
            "INVALID_PATH",
            "Project path must be absolute and its parent directory must exist.",
            {"path": payload.path},
        )

    if project_dir.exists() and any(project_dir.iterdir()) and not payload.force:
        return _error(
            409,
            "NOT_EMPTY",
            "Project directory already exists and is not empty.",
            {"path": payload.path},
        )

    _write_project_scaffold(project_dir, payload.name, payload.output_preset)
    touch_recent(project_dir, payload.name)
    return inspect_setup(path=str(project_dir))


@router.get("/inspect", response_model=DetectedInputs)
def inspect_setup(path: str = Query(...)) -> DetectedInputs:
    project_dir = Path(path)
    ensure_project_layout(project_dir)
    project_data = _load_project_data(project_dir)
    project = _project_name(project_dir, project_data)
    voice_path = _voice_path(project_dir, project_data)
    transcript_path = _transcript_path(project_dir, project_data)
    voice = _detect_voice(voice_path)
    transcript = _detect_transcript(transcript_path)
    alignment = _alignment_state(project_dir, voice, transcript)

    return DetectedInputs(
        path=str(project_dir),
        name=project,
        voice=voice,
        transcript=transcript,
        alignment=alignment,
    )


@router.websocket("/inspect/ws")
async def inspect_setup_ws(websocket: WebSocket, path: str = Query(...)) -> None:
    await websocket.accept()
    last_payload = ""
    while True:
        payload = inspect_setup(path=path).model_dump(mode="json")
        encoded = json.dumps(payload, sort_keys=True)
        if encoded != last_payload:
            await websocket.send_json(payload)
            last_payload = encoded
        await asyncio.sleep(1)


def _write_project_scaffold(project_dir: Path, name: str, output_preset: SetupOutputPreset) -> None:
    ensure_project_layout(project_dir)

    project_file = project_dir / "project.json"
    if project_file.exists():
        _seed_default_layers(project_dir)
        return

    audio_path = _find_voice_file(project_dir)
    transcript_path = project_dir / "transcript.txt"
    now = datetime.now(UTC).isoformat()
    project = Project.model_validate(
        {
            "version": 1,
            "name": name,
            "created_at": now,
            "updated_at": now,
            "audio": audio_path.name if audio_path is not None else "voice.wav",
            "transcript": {"kind": "plain_text", "path": transcript_path.name},
            "output": _project_output_for_setup_preset(output_preset),
            "layers": [],
            "subtitles": None,
            "watermark": None,
        }
    )
    project_file.write_text(
        json.dumps(project.model_dump(mode="json", by_alias=True, exclude_none=False), indent=2),
        encoding="utf-8",
    )
    _seed_default_layers(project_dir)


def _project_output_for_setup_preset(output_preset: SetupOutputPreset) -> dict[str, object]:
    if output_preset == SetupOutputPreset.draft:
        return {"preset": "draft"}
    if output_preset == SetupOutputPreset.vertical:
        return {
            "preset": "final",
            "resolution": "1080x1920",
            "width": 1080,
            "height": 1920,
        }
    return {"preset": "final"}


def _seed_default_layers(project_dir: Path) -> None:
    project_file = project_dir / "project.json"
    if not project_file.is_file():
        return
    data = json.loads(project_file.read_text(encoding="utf-8"))
    if data.get("layers"):
        return

    media_dir = project_dir / "media"
    media_files = (
        {path.name.lower(): path.name for path in media_dir.iterdir() if path.is_file()}
        if media_dir.exists()
        else {}
    )
    alignment = _load_alignment(project_dir)
    ranges = _sentence_ranges(alignment)
    duration = max((item[2] for item in ranges), default=30.0)

    foreground = media_files.get("foreground.png") or _first_media(media_files)
    pip = media_files.get("pip.png")
    backgrounds = [
        media_files[name]
        for name in ("bg0.png", "bg1.png", "bg2.png")
        if name in media_files
    ]

    layers: list[dict[str, object]] = [
        {
            "id": "subtitles",
            "kind": "sub",
            "name": "Subtitles",
            "items": [
                {
                    "id": "sub-auto",
                    "auto": True,
                    "label": "Auto subtitles",
                    "style": "default",
                }
            ],
        },
    ]
    if pip is not None:
        start, end = _range_for(ranges, 2)
        layers.append(
            {
                "id": "pip-z3",
                "kind": "pip",
                "name": "PiP z3",
                "items": [_visual_item("pip-1", pip, [2, 2], start, end, pip=True)],
            }
        )
    if foreground is not None:
        start, end = _range_for(ranges, 1)
        layers.append(
            {
                "id": "fg-z1",
                "kind": "fg",
                "name": "Foreground z1",
                "items": [_visual_item("fg-1", foreground, [1, 1], start, end)],
            }
        )
    if backgrounds:
        layers.append(
            {
                "id": "bg-main",
                "kind": "bg",
                "name": "Background",
                "items": [
                    _visual_item(
                        "bg-1",
                        backgrounds[0],
                        [1, len(ranges) or 1],
                        0.0,
                        duration,
                        background=True,
                    )
                ],
            }
        )

    data["layers"] = layers
    data["updated_at"] = datetime.now(UTC).isoformat()
    project_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_alignment(project_dir: Path) -> AlignmentResult | None:
    alignment_file = project_dir / ".vc" / "alignment.json"
    if not alignment_file.is_file():
        return None
    try:
        return AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def _sentence_ranges(alignment: AlignmentResult | None) -> list[tuple[int, float, float]]:
    if alignment is None:
        return []
    return [(sentence.index, sentence.start_s, sentence.end_s) for sentence in alignment.sentences]


def _range_for(ranges: list[tuple[int, float, float]], sentence_index: int) -> tuple[float, float]:
    for index, start, end in ranges:
        if index == sentence_index:
            return start, end
    start = max(0, (sentence_index - 1) * 5)
    return float(start), float(start + 5)


def _first_media(media_files: dict[str, str]) -> str | None:
    return next(iter(media_files.values()), None)


def _visual_item(
    item_id: str,
    media_id: str,
    sentences: list[int],
    start: float,
    end: float,
    *,
    background: bool = False,
    pip: bool = False,
) -> dict[str, object]:
    item: dict[str, object] = {
        "id": item_id,
        "mediaId": media_id,
        "sentences": sentences,
        "start": start,
        "end": end,
        "motion": {"kind": "ken_burns" if background else "none", "easing": "ease_in_out"},
        "transitions": {"in": "cut" if background else "fade", "out": "cut"},
    }
    if background:
        item["crossfade"] = 0.6
    if pip:
        item["pip"] = {"posX": 68, "posY": 14, "size": 30, "radius": 12, "opacity": 100}
    return item


def _load_project_data(project_dir: Path) -> dict[str, object] | None:
    project_file = project_dir / "project.json"
    if project_file.is_file():
        try:
            loaded = json.loads(project_file.read_text(encoding="utf-8"))
            return loaded if isinstance(loaded, dict) else None
        except (OSError, json.JSONDecodeError):
            pass
    return None


def _project_name(project_dir: Path, project_data: dict[str, object] | None) -> str:
    if project_data is not None:
        name = project_data.get("name")
        if isinstance(name, str) and name:
            return name
    return project_dir.name or "Untitled Project"


def _voice_path(project_dir: Path, project_data: dict[str, object] | None) -> Path:
    if project_data is not None:
        audio = project_data.get("audio")
        if isinstance(audio, str) and audio:
            return project_dir / audio
    found = _find_voice_file(project_dir)
    return found if found is not None else project_dir / "voice.wav"


def _transcript_path(project_dir: Path, project_data: dict[str, object] | None) -> Path:
    if project_data is not None:
        transcript = project_data.get("transcript")
        if isinstance(transcript, dict):
            path = transcript.get("path")
            if isinstance(path, str) and path:
                return project_dir / path
    return project_dir / "transcript.txt"


def _find_voice_file(project_dir: Path) -> Path | None:
    for name in ("voice.wav", "voice.mp3", "voice.m4a", "voice.flac", "voice.ogg"):
        path = project_dir / name
        if path.is_file():
            return path
    return None


def _detect_voice(path: Path) -> DetectedVoice | None:
    if not path.exists():
        return None
    if _is_locked_or_empty(path):
        return DetectedVoice(
            path=str(path),
            duration=0,
            sample_rate=0,
            channels=0,
            codec="unknown",
            state="copying",
        )
    try:
        import soundfile  # type: ignore[import-untyped]

        info = soundfile.info(str(path))
    except Exception:
        probed = _ffprobe_audio(path)
        if probed is not None:
            return DetectedVoice(
                path=str(path),
                duration=probed["duration"],
                sample_rate=int(probed["sample_rate"]),
                channels=int(probed["channels"]),
                codec=probed["codec"],
                state="copied",
            )
        return DetectedVoice(
            path=str(path),
            duration=0,
            sample_rate=0,
            channels=0,
            codec="unknown",
            state="invalid",
        )

    return DetectedVoice(
        path=str(path),
        duration=float(getattr(info, "duration", 0.0)),
        sample_rate=int(getattr(info, "samplerate", 0)),
        channels=int(getattr(info, "channels", 0)),
        codec=str(getattr(info, "subtype", "unknown")).lower(),
        state="copied",
    )


def _ffprobe_audio(path: Path) -> dict[str, float | int | str] | None:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,sample_rate,channels",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0:
        return None

    try:
        payload = json.loads(result.stdout)
        stream = next(
            (item for item in payload.get("streams", []) if item.get("codec_name")),
            None,
        )
        if stream is None:
            return None
        return {
            "duration": float(payload.get("format", {}).get("duration", 0.0)),
            "sample_rate": int(stream.get("sample_rate", 0)),
            "channels": int(stream.get("channels", 0)),
            "codec": str(stream.get("codec_name", "unknown")).lower(),
        }
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def _detect_transcript(path: Path) -> DetectedTranscript | None:
    if not path.exists():
        return None
    if _is_locked_or_empty(path):
        return DetectedTranscript(path=str(path), sentence_count=0, state="empty")
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return DetectedTranscript(path=str(path), sentence_count=0, state="invalid")
    if not text.strip():
        return DetectedTranscript(path=str(path), sentence_count=0, state="empty")
    return DetectedTranscript(path=str(path), sentence_count=len(segment(text)), state="parsed")


def _alignment_state(
    project_dir: Path,
    voice: DetectedVoice | None,
    transcript: DetectedTranscript | None,
) -> SetupAlignment:
    project_data = _load_project_data(project_dir)
    voice_path = _voice_path(project_dir, project_data)
    transcript_path = _transcript_path(project_dir, project_data)
    audio_duration = voice.duration if voice is not None else 0.0
    base = SetupAlignment(
        status="pending",
        hash="",
        device="cuda · fp16",
        model="large-v3",
        audio_duration=audio_duration,
        cache_hit=False,
    )
    if voice is None or transcript is None:
        return base
    if voice.state.value != "copied" or transcript.state.value != "parsed":
        return base

    transcript_text = transcript_path.read_text(encoding="utf-8")
    current_hash = compute_alignment_hash(voice_path, transcript_text)
    hash_file = project_dir / ".vc" / "alignment.hash"
    alignment_file = project_dir / ".vc" / "alignment.json"
    cache_hit = (
        hash_file.is_file()
        and alignment_file.is_file()
        and hash_file.read_text(encoding="utf-8").strip() == current_hash
    )
    return SetupAlignment(
        status="aligned" if cache_hit else "pending",
        hash=current_hash,
        device=base.device,
        model=base.model,
        audio_duration=base.audio_duration,
        cache_hit=cache_hit,
    )


def _is_locked_or_empty(path: Path) -> bool:
    try:
        return path.stat().st_size == 0
    except OSError:
        return True
