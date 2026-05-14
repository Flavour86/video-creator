from __future__ import annotations

import importlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError

from server.db.project_configs import latest_config_for_project_path, save_config_snapshot
from server.db.projects import (
    get_project_by_path,
    list_projects,
    list_recent,
    project_id_for_path,
    project_path_for_id,
    remove_recent,
    touch_recent,
)
from server.domain.project import (
    AlignmentState,
    DetectedInputs,
    Project,
    ProjectConfigLoadResponse,
    ProjectConfigSaveResponse,
    ProjectStatus,
    RecentProject,
    RecentProjectCard,
    ensure_project_layout,
    load_project,
)
from server.domain.timing import AlignmentResult
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment
from server.routes.alignment import get_alignment, run_alignment
from server.routes.setup import inspect_setup

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    path: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)


class ProjectResponse(BaseModel):
    project_id: str
    path: str
    name: str


class OpenProjectRequest(BaseModel):
    path: str = Field(min_length=1)


class PutProjectConfigRequest(BaseModel):
    config: dict[str, Any]


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def _project_metadata(project_dir: Path, name: str, last_render_at: str = "") -> RecentProject:
    project = _load_recent_project(project_dir)
    audio_path = _audio_path(project_dir, project)
    transcript_path = _transcript_path(project_dir, project)
    transcript_text = _read_text(transcript_path)
    alignment = _load_current_alignment(project_dir, audio_path, transcript_text)
    alignment_state = _alignment_state(audio_path, transcript_path, transcript_text, alignment)
    return RecentProject(
        path=str(project_dir),
        name=name,
        last_render_at=last_render_at,
        voice_duration=_voice_duration(audio_path),
        sentence_count=_sentence_count(transcript_text, alignment, alignment_state),
        media_count=_media_count(project_dir),
        alignment_state=alignment_state,
        palette_seed=name,
    )


def _project_card(row: dict[str, object]) -> RecentProjectCard:
    project_dir = Path(str(row["path"]))
    project = _load_recent_project(project_dir)
    audio_path = _audio_path(project_dir, project)
    transcript_path = _transcript_path(project_dir, project)
    transcript_text = _read_text(transcript_path)
    alignment = _load_current_alignment(project_dir, audio_path, transcript_text)
    alignment_state = _alignment_state(audio_path, transcript_path, transcript_text, alignment)
    return RecentProjectCard(
        project_id=str(row["project_id"]),
        name=str(row["name"]),
        last_render_at=str(row["last_render_at"]),
        voice_duration=_voice_duration(audio_path),
        sentence_count=_sentence_count(transcript_text, alignment, alignment_state),
        media_count=_media_count(project_dir),
        alignment_state=alignment_state,
        status=_project_status(project_dir, project),
        thumbnail_path=_optional_str(row.get("thumbnail_path")),
        current_config_hash=_optional_str(row.get("current_config_hash")),
        last_rendered_config_hash=_optional_str(row.get("last_rendered_config_hash")),
        has_unrendered_changes=bool(row.get("has_unrendered_changes")),
        latest_render_id=None,
        latest_render_status=None,
    )


def _project_status(project_dir: Path, project: Project | None) -> ProjectStatus:
    if not project_dir.exists():
        return ProjectStatus.missing
    if project is None:
        return ProjectStatus.corrupt
    return ProjectStatus.ready


def _optional_str(value: object) -> str | None:
    return str(value) if value is not None else None


def _write_valid_project_config(project_dir: Path, data: dict[str, Any]) -> str:
    updated = Project.model_validate(data)
    return save_config_snapshot(
        project_dir,
        updated.model_dump(mode="json", by_alias=True, exclude_none=False),
    )


def _project_path_or_error(project_id: str) -> Path | JSONResponse:
    project_dir = project_path_for_id(project_id)
    if project_dir is None or not project_dir.is_dir():
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project not found.",
            {"project_id": project_id},
        )
    return project_dir


def _load_recent_project(project_dir: Path) -> Project | None:
    try:
        return load_project(project_dir)
    except (OSError, json.JSONDecodeError, ValidationError):
        return None


def _audio_path(project_dir: Path, project: Project | None) -> Path:
    if project is not None and project.audio:
        configured = project_dir / str(project.audio)
        if configured.is_file():
            return configured
    found = _find_voice_file(project_dir)
    return found if found is not None else project_dir / "voice.wav"


def _transcript_path(project_dir: Path, project: Project | None) -> Path:
    if project is None:
        return project_dir / "transcript.txt"
    return project_dir / str(getattr(project.transcript, "path", "transcript.txt"))


def _read_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


def _find_voice_file(project_dir: Path) -> Path | None:
    for name in ("voice.wav", "voice.mp3", "voice.m4a", "voice.flac", "voice.ogg"):
        path = project_dir / name
        if path.is_file():
            return path
    return None


def _media_count(project_dir: Path) -> int:
    if not project_dir.exists():
        return 0
    media_dir = project_dir / "media"
    if media_dir.exists():
        return len([entry for entry in media_dir.iterdir() if entry.is_file()])
    return len(
        [
            entry
            for entry in project_dir.iterdir()
            if entry.is_file()
            and entry.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"}
        ]
    )


def _load_current_alignment(
    project_dir: Path,
    audio_path: Path,
    transcript_text: str | None,
) -> AlignmentResult | None:
    alignment_file = project_dir / ".vc" / "alignment.json"
    if not alignment_file.is_file():
        return None

    hash_file = project_dir / ".vc" / "alignment.hash"
    if hash_file.is_file() and audio_path.is_file() and transcript_text is not None:
        current_hash = compute_alignment_hash(audio_path, transcript_text)
        if hash_file.read_text(encoding="utf-8").strip() != current_hash:
            return None

    try:
        return AlignmentResult.model_validate_json(alignment_file.read_text(encoding="utf-8"))
    except (OSError, ValidationError, ValueError):
        return None


def _alignment_state(
    audio_path: Path,
    transcript_path: Path,
    transcript_text: str | None,
    alignment: AlignmentResult | None,
) -> AlignmentState:
    if not audio_path.is_file() or not transcript_path.is_file() or transcript_text is None:
        return AlignmentState.missing
    if alignment is not None:
        return AlignmentState.aligned
    return AlignmentState.pending


def _voice_duration(audio_path: Path) -> str:
    if not audio_path.is_file():
        return ""
    try:
        soundfile = importlib.import_module("soundfile")
        info = soundfile.info(str(audio_path))
        duration_s = float(getattr(info, "duration", 0.0))
    except Exception:
        duration_s = _ffprobe_duration(audio_path)
    if duration_s <= 0:
        return ""
    return _format_duration(duration_s)


def _ffprobe_duration(audio_path: Path) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(audio_path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired):
        return 0.0
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def _format_duration(duration_s: float) -> str:
    total_seconds = max(0, round(duration_s))
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes:02d}:{seconds:02d}"


def _sentence_count(
    transcript_text: str | None,
    alignment: AlignmentResult | None,
    alignment_state: AlignmentState,
) -> int:
    if alignment_state == AlignmentState.aligned and alignment is not None:
        return len(alignment.sentences)
    if transcript_text is None:
        return 0
    return len(segment(transcript_text))


@router.post("", response_model=ProjectResponse)
async def create_project(payload: CreateProjectRequest) -> ProjectResponse | JSONResponse:
    project_dir = Path(payload.path)
    if not project_dir.is_absolute() or not project_dir.parent.exists():
        return _error(
            400,
            "INVALID_PATH",
            "Project path must be absolute and its parent directory must exist.",
            {"path": payload.path},
        )

    if project_dir.exists() and any(project_dir.iterdir()):
        return _error(
            409,
            "NOT_EMPTY",
            "Project directory already exists and is not empty.",
            {"path": payload.path},
        )

    now = datetime.now(UTC).isoformat()
    project = Project.model_validate(
        {
            "version": 1,
            "name": payload.name,
            "created_at": now,
            "updated_at": now,
            "audio": "",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [],
            "subtitles": None,
            "watermark": None,
        }
    )
    try:
        ensure_project_layout(project_dir)
    except PermissionError:
        return _error(
            403,
            "PERMISSION_DENIED",
            "Project folder cannot be created because permission was denied.",
            {"path": payload.path},
        )
    except OSError as exc:
        return _error(
            400,
            "INVALID_PATH",
            "Project folder could not be created.",
            {"path": payload.path, "error": str(exc)},
        )
    touch_recent(project_dir, payload.name)
    save_config_snapshot(
        project_dir,
        project.model_dump(mode="json", by_alias=True, exclude_none=False),
    )
    return ProjectResponse(
        project_id=project_id_for_path(project_dir),
        path=str(project_dir),
        name=payload.name,
    )


@router.get("", response_model=list[RecentProjectCard])
async def projects(limit: int = Query(default=20, ge=1, le=500)) -> list[RecentProjectCard]:
    return [_project_card(row) for row in list_projects(limit=limit)]


@router.post("/new", response_model=ProjectResponse)
async def new_project(payload: CreateProjectRequest) -> ProjectResponse | JSONResponse:
    return await create_project(payload)


@router.get("/recent", response_model=list[RecentProject])
async def recent_projects() -> list[RecentProject]:
    rows = list_recent()
    return [
        _project_metadata(Path(row["path"]), row["name"], row["last_render_at"]) for row in rows
    ]


@router.post("/open", response_model=RecentProject)
async def open_project(payload: OpenProjectRequest) -> RecentProject | JSONResponse:
    project_dir = Path(payload.path)
    if not project_dir.is_dir():
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project folder is missing.",
            {"path": payload.path},
        )
    ensure_project_layout(project_dir)
    config = latest_config_for_project_path(project_dir)
    if config is None:
        try:
            project = load_project(project_dir)
            name = project.name
        except (FileNotFoundError, Exception):
            return _error(
                404,
                "PROJECT_NOT_FOUND",
                "Project config not found.",
                {"path": payload.path},
            )
    else:
        name = config.get("name", project_dir.name)
    touch_recent(project_dir, name)
    return _project_metadata(project_dir, name)


@router.delete("/recent")
async def delete_recent_project(payload: OpenProjectRequest) -> dict[str, bool]:
    remove_recent(Path(payload.path))
    return {"ok": True}


class PutLayersRequest(BaseModel):
    layers: list[Any]


class PutLayersResponse(BaseModel):
    layers: list[Any]


class PutSubtitlesRequest(BaseModel):
    burn_in: bool


class PutSubtitlesResponse(BaseModel):
    subtitles: dict[str, Any]


class PutWatermarkRequest(BaseModel):
    media_id: str | None = Field(default=None, alias="mediaId")
    pos_x: float = Field(default=100, alias="posX", ge=0, le=100)
    pos_y: float = Field(default=100, alias="posY", ge=0, le=100)
    scale: float = Field(default=0.08, ge=0.05, le=0.3)
    opacity: float = Field(default=60, ge=0, le=100)


class PutWatermarkResponse(BaseModel):
    watermark: dict[str, Any] | None


@router.get("/load", response_model=None)
async def load_project_data(project: str = Query(...)) -> JSONResponse:
    project_dir = Path(project)
    if not project_dir.is_dir():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})
    data = latest_config_for_project_path(project_dir)
    if data is None:
        project_json = project_dir / "project.json"
        if project_json.exists():
            data = json.loads(project_json.read_text(encoding="utf-8"))
        else:
            return _error(
                404,
                "PROJECT_NOT_FOUND",
                "Project config not found.",
                {"project": project},
            )
    return JSONResponse(data)


@router.put("/layers", response_model=None)
async def put_layers(
    payload: PutLayersRequest,
    project: str = Query(...),
) -> PutLayersResponse | JSONResponse:
    project_dir = Path(project)
    project_json = project_dir / "project.json"
    if not project_json.exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    data = latest_config_for_project_path(project_dir)
    if data is None:
        data = json.loads(project_json.read_text(encoding="utf-8"))
    data["layers"] = payload.layers
    data["updated_at"] = datetime.now(UTC).isoformat()
    try:
        _write_valid_project_config(project_dir, data)
    except ValidationError as exc:
        return _error(
            422,
            "INVALID_PROJECT_CONFIG",
            "Project config failed validation.",
            {"error": str(exc)},
        )
    return PutLayersResponse(layers=payload.layers)


@router.put("/subtitles", response_model=None)
async def put_subtitles(
    payload: PutSubtitlesRequest,
    project: str = Query(...),
) -> PutSubtitlesResponse | JSONResponse:
    project_dir = Path(project)
    project_json = project_dir / "project.json"
    if not project_json.exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    loaded = load_project(project_dir)
    data = loaded.model_dump(mode="json", by_alias=True, exclude_none=False)
    data["subtitles"] = _default_subtitles(payload.burn_in)
    data["updated_at"] = datetime.now(UTC).isoformat()
    _write_valid_project_config(project_dir, data)
    return PutSubtitlesResponse(subtitles=data["subtitles"])


def _default_subtitles(burn_in: bool) -> dict[str, Any]:
    return {
        "burn_in": burn_in,
        "style": {
            "font": "Arial",
            "size": 28,
            "position": "bottom-center",
            "max_chars_per_line": 42,
            "bg_style": "shadow",
        },
    }


@router.put("/watermark", response_model=None)
async def put_watermark(
    payload: PutWatermarkRequest,
    project: str = Query(...),
) -> PutWatermarkResponse | JSONResponse:
    project_dir = Path(project)
    project_json = project_dir / "project.json"
    if not project_json.exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    loaded = load_project(project_dir)
    data = loaded.model_dump(mode="json", by_alias=True, exclude_none=False)
    data["watermark"] = None if payload.media_id is None else payload.model_dump(by_alias=True)
    data["updated_at"] = datetime.now(UTC).isoformat()
    _write_valid_project_config(project_dir, data)
    return PutWatermarkResponse(watermark=data["watermark"])


@router.post("/new-folder", response_model=ProjectResponse)
async def new_folder_project(payload: CreateProjectRequest) -> ProjectResponse | JSONResponse:
    return await create_project(payload)


@router.delete("/{project_id}", response_model=None)
async def delete_project(project_id: str) -> dict[str, bool] | JSONResponse:
    project_dir = project_path_for_id(project_id)
    if project_dir is None:
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project not found.",
            {"project_id": project_id},
        )
    remove_recent(project_dir)
    return {"ok": True}


@router.post("/{project_id}/inspect", response_model=DetectedInputs)
async def inspect_project(project_id: str) -> DetectedInputs | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return inspect_setup(path=str(project_dir))


@router.post("/{project_id}/alignment", response_model=None)
async def run_project_alignment(
    project_id: str,
    force: bool = Query(False),
) -> Any:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await run_alignment(project=str(project_dir), force=force)


@router.get("/{project_id}/alignment", response_model=None)
async def get_project_alignment(project_id: str) -> Any:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await get_alignment(project=str(project_dir))


@router.get("/{project_id}/config", response_model=ProjectConfigLoadResponse)
async def get_project_config(project_id: str) -> ProjectConfigLoadResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    config = latest_config_for_project_path(project_dir)
    if config is None:
        config = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
        config_hash = save_config_snapshot(project_dir, config)
    else:
        config_hash = save_config_snapshot(project_dir, config)
    row = get_project_by_path(project_dir)
    return ProjectConfigLoadResponse(
        project_id=project_id,
        config=Project.model_validate(config),
        config_hash=config_hash,
        last_rendered_config_hash=(
            _optional_str(row.get("last_rendered_config_hash")) if row else None
        ),
        has_unrendered_changes=bool(row.get("has_unrendered_changes")) if row else True,
    )


@router.put("/{project_id}/config", response_model=ProjectConfigSaveResponse)
async def put_project_config(
    project_id: str,
    payload: PutProjectConfigRequest,
) -> ProjectConfigSaveResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    try:
        config_hash = _write_valid_project_config(project_dir, payload.config)
    except ValidationError as exc:
        return _error(
            422,
            "INVALID_PROJECT_CONFIG",
            "Project config failed validation.",
            {"error": str(exc)},
        )
    row = get_project_by_path(project_dir)
    return ProjectConfigSaveResponse(
        project_id=project_id,
        config_hash=config_hash,
        saved_at=datetime.now(UTC).isoformat(),
        has_unrendered_changes=bool(row.get("has_unrendered_changes")) if row else True,
    )


class RenderCacheResponse(BaseModel):
    project_id: str
    cached_count: int
    total_count: int
    state: str  # warm | cold | partial | invalid


@router.get("/{project_id}/render-cache", response_model=RenderCacheResponse)
async def get_render_cache(project_id: str) -> RenderCacheResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    clips_dir = project_dir / ".vc" / "clips"
    cached = 0
    if clips_dir.is_dir():
        cached = sum(
            1 for p in clips_dir.iterdir()
            if p.is_file() and p.suffix == ".mp4" and p.stat().st_size > 0
        )
    total = cached  # total matches cached in absence of config-based counting
    if cached == 0 and total == 0:
        state = "cold"
    elif cached > 0 and cached == total:
        state = "warm"
    else:
        state = "partial"
    return RenderCacheResponse(
        project_id=project_id,
        cached_count=cached,
        total_count=total,
        state=state,
    )
