from __future__ import annotations

import asyncio
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Query, WebSocket
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from server.db.projects import touch_recent
from server.domain.project import DetectedInputs, Project
from server.domain.timing import AlignmentResult
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
    touch_recent(project_dir, payload.name)
    return inspect_setup(path=str(project_dir))


@router.get("/inspect", response_model=DetectedInputs)
def inspect_setup(path: str = Query(...)) -> DetectedInputs:
    project_dir = Path(path)
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


def _write_project_scaffold(project_dir: Path, name: str, output_preset: str) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "media").mkdir(exist_ok=True)
    (project_dir / "renders").mkdir(exist_ok=True)
    (project_dir / ".vc").mkdir(exist_ok=True)
    _import_root_media(project_dir)

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
    _seed_default_layers(project_dir)


def _seed_default_layers(project_dir: Path) -> None:
    project_file = project_dir / "project.json"
    if not project_file.is_file():
        return
    data = json.loads(project_file.read_text(encoding="utf-8"))
    if data.get("layers"):
        return

    media_dir = project_dir / "media"
    media_files = {path.name.lower(): path.name for path in media_dir.iterdir() if path.is_file()} if media_dir.exists() else {}
    alignment = _load_alignment(project_dir)
    ranges = _sentence_ranges(alignment)
    duration = max((item[2] for item in ranges), default=30.0)

    foreground = media_files.get("foreground.png") or _first_media(media_files)
    pip = media_files.get("pip.png")
    backgrounds = [media_files[name] for name in ("bg0.png", "bg1.png", "bg2.png") if name in media_files]

    layers: list[dict[str, object]] = [
        {"id": "subtitles", "kind": "sub", "name": "Subtitles", "items": [{"id": "sub-auto", "auto": True, "label": "Auto subtitles", "style": "default"}]},
    ]
    if pip is not None:
        start, end = _range_for(ranges, 2)
        layers.append({
            "id": "pip-z3",
            "kind": "pip",
            "name": "PiP z3",
            "items": [_visual_item("pip-1", pip, [2, 2], start, end, pip=True)],
        })
    if foreground is not None:
        start, end = _range_for(ranges, 1)
        layers.append({
            "id": "fg-z1",
            "kind": "fg",
            "name": "Foreground z1",
            "items": [_visual_item("fg-1", foreground, [1, 1], start, end)],
        })
    if backgrounds:
        layers.append({
            "id": "bg-main",
            "kind": "bg",
            "name": "Background",
            "items": [_visual_item("bg-1", backgrounds[0], [1, len(ranges) or 1], 0.0, duration, background=True)],
        })

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


def _import_root_media(project_dir: Path) -> None:
    media_dir = project_dir / "media"
    media_dir.mkdir(exist_ok=True)
    for path in project_dir.iterdir():
        if not path.is_file() or path.name in {"project.json", "transcript.txt"} or path.name.startswith("voice."):
            continue
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"}:
            continue
        target = media_dir / path.name
        if not target.exists():
            shutil.copy2(path, target)


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
