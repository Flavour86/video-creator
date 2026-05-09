from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from server.domain.project import DetectedInputs, Project
from schemas import DetectedTranscript, DetectedVoice, SetupAlignment
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment

router = APIRouter(prefix="/setup", tags=["setup"])


class ScaffoldRequest(BaseModel):
    path: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    output_preset: str = "final"
    force: bool = False


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


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
    return inspect_setup(path=str(project_dir))


@router.get("/inspect", response_model=DetectedInputs)
def inspect_setup(path: str = Query(...)) -> DetectedInputs:
    project_dir = Path(path)
    project = _load_project_name(project_dir)
    voice = _detect_voice(project_dir / "voice.wav")
    transcript = _detect_transcript(project_dir / "transcript.txt")
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


def _write_project_scaffold(project_dir: Path, name: str, output_preset: str) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "media").mkdir(exist_ok=True)
    (project_dir / "renders").mkdir(exist_ok=True)
    (project_dir / ".vc").mkdir(exist_ok=True)

    project_file = project_dir / "project.json"
    if project_file.exists():
        return

    now = datetime.now(UTC).isoformat()
    project = Project.model_validate(
        {
            "version": 1,
            "name": name,
            "created_at": now,
            "updated_at": now,
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft" if output_preset == "draft" else "final"},
            "layers": [],
            "subtitles": None,
            "watermark": None,
        }
    )
    project_file.write_text(
        json.dumps(project.model_dump(mode="json", by_alias=True, exclude_none=False), indent=2),
        encoding="utf-8",
    )


def _load_project_name(project_dir: Path) -> str:
    project_file = project_dir / "project.json"
    if project_file.is_file():
        try:
            data = json.loads(project_file.read_text(encoding="utf-8"))
            name = data.get("name")
            if isinstance(name, str) and name:
                return name
        except (OSError, json.JSONDecodeError):
            pass
    return project_dir.name or "Untitled Project"


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
        import soundfile

        info = soundfile.info(str(path))
    except Exception:
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
    voice_path = project_dir / "voice.wav"
    transcript_path = project_dir / "transcript.txt"
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
