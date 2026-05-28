from __future__ import annotations

import hashlib
import importlib
import json
import mimetypes
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Query, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from schemas import (  # type: ignore[import-not-found]
    LauncherRenderStatusTag,
    PaginationMeta,
)

from server.db.project_configs import (
    has_valid_config_for_project_id,
    latest_config_for_project_path,
    save_config_snapshot,
)
from server.db.projects import (
    get_project_by_path,
    list_recent,
    project_id_for_path,
    project_path_for_id,
    remove_project,
    remove_project_and_config,
    remove_recent,
    set_project_thumbnail,
    touch_recent,
)
from server.db.projects import (
    list_project_index as list_projects,
)
from server.db.renders import add_render_artifact, list_render_artifacts
from server.domain.project import (
    AlignmentState,
    DetectedInputs,
    Project,
    ProjectConfigLoadResponse,
    ProjectConfigSaveResponse,
    ProjectStatus,
    RecentProject,
    RecentProjectCard,
    RecentProjectsPage,
    ensure_project_layout,
    load_project,
)
from server.domain.timing import AlignmentResult
from server.pipeline.cache import compute_alignment_hash
from server.pipeline.chunker import segment
from server.pipeline.clip_render import ClipRenderItem, clip_cache_path_for_item
from server.pipeline.filtergraph import PRESETS, visual_items_bottom_to_top
from server.routes.alignment import get_alignment, run_alignment
from server.routes.setup import (
    SETUP_SESSION_COOKIE,
    _is_valid_setup_id,
    _load_setup_draft_record,
    _setup_draft_dir,
    clear_setup_session_cookie,
    inspect_setup,
)

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="allow")


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
    project = _load_recent_card_project(project_dir)
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
    project = _load_recent_card_project(project_dir)
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
        thumbnail_path=_thumbnail_for_card(row, project_dir),
        current_config_hash=_optional_str(row.get("current_config_hash")),
        last_rendered_config_hash=_optional_str(row.get("last_rendered_config_hash")),
        has_unrendered_changes=bool(row.get("has_unrendered_changes")),
        latest_render_id=_optional_str(row.get("latest_render_id")),
        latest_render_status=_render_status_for_contract(row.get("latest_render_status")),
        render_status_tag=_launcher_render_status(row),
    )


def _project_status(project_dir: Path, project: Project | None) -> ProjectStatus:
    if not project_dir.exists():
        return ProjectStatus.missing
    if project is None:
        return ProjectStatus.corrupt
    return ProjectStatus.ready


def _is_valid_recent_row(row: dict[str, object]) -> bool:
    project_id = _optional_str(row.get("project_id"))
    if not project_id:
        return False
    project_dir = Path(str(row["path"]))
    if not project_dir.is_dir():
        return False
    if not has_valid_config_for_project_id(project_id):
        return False
    return _load_recent_card_project(project_dir) is not None


def _valid_project_rows() -> list[dict[str, object]]:
    rows = list_projects()
    valid_rows: list[dict[str, object]] = []
    for row in rows:
        if _is_valid_recent_row(row):
            valid_rows.append(row)
        else:
            project_id = _optional_str(row.get("project_id"))
            if project_id:
                # BUG-018: hard-delete invalid project rows from both projects and configs.
                remove_project_and_config(project_id)
            else:
                remove_recent(Path(str(row["path"])))
    return valid_rows


def _thumbnail_for_card(row: dict[str, object], project_dir: Path) -> str:
    render_thumb = _latest_render_thumbnail(row, project_dir)
    if render_thumb is not None:
        set_project_thumbnail(project_dir, render_thumb)
        return _thumbnail_url(str(row["project_id"]), render_thumb.name)
    stored_thumb = _stored_project_thumbnail(row, project_dir)
    if stored_thumb is not None:
        return _thumbnail_url(str(row["project_id"]), stored_thumb.name)
    placeholder = _ensure_placeholder_thumbnail(project_dir, str(row["name"]))
    set_project_thumbnail(project_dir, placeholder)
    return _thumbnail_url(str(row["project_id"]), placeholder.name)


def _latest_render_thumbnail(row: dict[str, object], project_dir: Path) -> Path | None:
    render_id = _optional_str(row.get("latest_render_id"))
    if render_id is None or _render_status_for_contract(row.get("latest_render_status")) != "done":
        return None
    thumbs_dir = _thumbs_dir(project_dir)
    for artifact in list_render_artifacts(render_id):
        if str(artifact.get("kind")) != "thumbnail":
            continue
        artifact_path = Path(str(artifact.get("path", "")))
        if artifact_path.is_file() and artifact_path.parent.resolve() == thumbs_dir.resolve():
            return artifact_path

    output_path = _optional_str(row.get("latest_render_output_path"))
    if output_path is None:
        return None
    source = Path(output_path)
    if not source.is_file():
        return None
    target = thumbs_dir / f"render-{_safe_thumb_stem(render_id)}.jpg"
    if target.is_file():
        return target
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(source), "-frames:v", "1", "-q:v", "3", str(target)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if target.is_file() and target.stat().st_size > 0:
        add_render_artifact(render_id=render_id, kind="thumbnail", path=target)
        return target
    return None


def _stored_project_thumbnail(row: dict[str, object], project_dir: Path) -> Path | None:
    stored = _optional_str(row.get("thumbnail_path"))
    if stored is None:
        return None
    thumb = Path(stored)
    if thumb.is_file() and thumb.parent.resolve() == _thumbs_dir(project_dir).resolve():
        return thumb
    return None


def _ensure_placeholder_thumbnail(project_dir: Path, seed: str) -> Path:
    thumbs_dir = _thumbs_dir(project_dir)
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    target = thumbs_dir / "project-placeholder.svg"
    if not target.exists():
        colors = _placeholder_colors(seed)
        target.write_text(
            (
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">'
                f'<rect width="100" height="180" fill="{colors[0]}"/>'
                f'<rect x="100" width="100" height="180" fill="{colors[1]}"/>'
                f'<rect x="200" width="100" height="180" fill="{colors[2]}"/>'
                "</svg>"
            ),
            encoding="utf-8",
        )
    return target


def _placeholder_colors(seed: str) -> tuple[str, str, str]:
    digest = hashlib.sha256(seed.casefold().encode("utf-8")).hexdigest()
    return (f"#{digest[0:6]}", f"#{digest[6:12]}", f"#{digest[12:18]}")


def _safe_thumb_stem(value: str) -> str:
    safe = "".join(char if char.isalnum() or char in "-_" else "-" for char in value)
    return safe or hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _thumbs_dir(project_dir: Path) -> Path:
    return project_dir / ".vc" / "thumbs"


def _thumbnail_url(project_id: str, filename: str) -> str:
    return f"/projects/{quote(project_id, safe='')}/thumbnail/{quote(filename, safe='')}"


def _render_status_for_contract(status: object) -> str | None:
    if status is None:
        return None
    value = str(status)
    mapping = {
        "idle": "idle",
        "queued": "queued",
        "running": "verifying",
        "rendering": "verifying",
        "verifying": "verifying",
        "prerender": "prerender",
        "subtitles": "subtitles",
        "composing": "composing",
        "muxing": "muxing",
        "logging_history": "logging_history",
        "done": "done",
        "rendered": "done",
        "cancelling": "cancelling",
        "cancelled": "cancelled",
        "error": "failed",
        "failed": "failed",
        "output_missing": "output_missing",
        "partial": "partial_excluded",
        "partial_excluded": "partial_excluded",
        "ffmpeg_warning": "ffmpeg_warning",
        "ffmpeg_fatal_error": "ffmpeg_fatal_error",
        "history_empty": "history_empty",
    }
    return mapping.get(value)


def _launcher_render_status(row: dict[str, object]) -> LauncherRenderStatusTag | None:
    status = row.get("last_render_status") or row.get("latest_render_status")
    if status is None:
        return LauncherRenderStatusTag.unrendered
    mapping = {
        "queued": LauncherRenderStatusTag.queued,
        "idle": LauncherRenderStatusTag.unrendered,
        "running": LauncherRenderStatusTag.rendering,
        "rendering": LauncherRenderStatusTag.rendering,
        "verifying": LauncherRenderStatusTag.rendering,
        "prerender": LauncherRenderStatusTag.rendering,
        "subtitles": LauncherRenderStatusTag.rendering,
        "composing": LauncherRenderStatusTag.rendering,
        "muxing": LauncherRenderStatusTag.rendering,
        "logging_history": LauncherRenderStatusTag.rendering,
        "cancelling": LauncherRenderStatusTag.rendering,
        "done": LauncherRenderStatusTag.rendered,
        "rendered": LauncherRenderStatusTag.rendered,
        "error": LauncherRenderStatusTag.failed,
        "failed": LauncherRenderStatusTag.failed,
        "output_missing": LauncherRenderStatusTag.failed,
        "partial": LauncherRenderStatusTag.failed,
        "partial_excluded": LauncherRenderStatusTag.failed,
        "ffmpeg_warning": LauncherRenderStatusTag.failed,
        "ffmpeg_fatal_error": LauncherRenderStatusTag.failed,
        "cancelled": LauncherRenderStatusTag.cancelled,
    }
    return mapping.get(str(status), LauncherRenderStatusTag.failed)


def _optional_str(value: object) -> str | None:
    return str(value) if value is not None else None


def _write_valid_project_config(project_dir: Path, data: dict[str, Any]) -> str:
    updated = Project.model_validate(_ensure_subtitles_layer_config(data))
    return save_config_snapshot(
        project_dir,
        updated.model_dump(mode="json", by_alias=True, exclude_none=False),
    )


def _default_subtitles_layer() -> dict[str, object]:
    return {
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
    }


def _ensure_subtitles_layer_config(data: dict[str, Any]) -> dict[str, Any]:
    layers = data.get("layers")
    if not isinstance(layers, list):
        return data
    for layer in layers:
        if isinstance(layer, dict) and layer.get("kind") == "sub":
            return data
    updated = dict(data)
    updated["layers"] = [_default_subtitles_layer(), *layers]
    return updated


def _output_for_setup_preset(output_preset: object) -> dict[str, object]:
    preset_value = str(getattr(output_preset, "value", output_preset))
    if preset_value == "draft":
        return {"preset": "draft"}
    if preset_value == "vertical":
        return {
            "preset": "final",
            "resolution": "9:16",
            "width": 1080,
            "height": 1920,
        }
    return {"preset": "final"}


def _watermark_kind_from_name(name: str) -> str:
    suffix = Path(name).suffix.lower()
    return "watermark_video" if suffix in {".mp4", ".mov", ".webm"} else "watermark_image"


def _discard_setup_draft(setup_id: str) -> None:
    if not _is_valid_setup_id(setup_id):
        return
    shutil.rmtree(_setup_draft_dir(setup_id), ignore_errors=True)


def _materialize_project_from_setup_draft(setup_id: str) -> ProjectResponse | JSONResponse:
    record = _load_setup_draft_record(setup_id)
    if record is None:
        return _error(
            404,
            "SETUP_DRAFT_NOT_FOUND",
            "Setup draft was not found.",
            {"setup_id": setup_id},
        )

    if not record.name.strip():
        return _error(
            400,
            "PROJECT_NAME_REQUIRED",
            "Project name is required.",
            {"setup_id": setup_id},
        )
    if (
        record.voice_staged_path is None
        or record.transcript_staged_path is None
        or record.subtitles_staged_path is None
    ):
        return _error(
            400,
            "SETUP_INCOMPLETE",
            "Setup artifacts are incomplete. Provide voice, transcript, and subtitles.",
            {"setup_id": setup_id},
        )
    alignment_status = getattr(record.alignment.status, "value", record.alignment.status)
    if alignment_status != "aligned":
        return _error(
            400,
            "SETUP_INCOMPLETE",
            "Setup alignment must succeed before creating project.",
            {"setup_id": setup_id},
        )

    project_dir = Path(record.path)
    if not project_dir.is_absolute() or not project_dir.parent.exists():
        return _error(
            400,
            "INVALID_PATH",
            "Project path must be absolute and its parent directory must exist.",
            {"path": record.path},
        )
    if project_dir.exists() and any(project_dir.iterdir()):
        return _error(
            409,
            "NOT_EMPTY",
            "Project directory already exists and is not empty.",
            {"path": record.path},
        )

    voice_source = Path(record.voice_staged_path)
    transcript_source = Path(record.transcript_staged_path)
    subtitles_source = Path(record.subtitles_staged_path)
    if (
        not voice_source.is_file()
        or not transcript_source.is_file()
        or not subtitles_source.is_file()
    ):
        return _error(
            400,
            "SETUP_INCOMPLETE",
            "Setup artifacts are missing from staging.",
            {"setup_id": setup_id},
        )

    existed_before = project_dir.exists()
    now = datetime.now(UTC).isoformat()
    try:
        ensure_project_layout(project_dir)
        voice_target = project_dir / "voice.wav"
        transcript_target = project_dir / "transcript.txt"
        subtitles_target = project_dir / "subtitles.srt"
        shutil.copy2(voice_source, voice_target)
        shutil.copy2(transcript_source, transcript_target)
        shutil.copy2(subtitles_source, subtitles_target)

        media_entries: list[dict[str, object]] = []
        watermark_payload: dict[str, object] | None = None
        if record.watermark_staged_path is not None:
            watermark_source = Path(record.watermark_staged_path)
            if watermark_source.is_file():
                watermark_name = Path(record.watermark_source_path or watermark_source.name).name
                watermark_target = project_dir / "media" / watermark_name
                watermark_target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(watermark_source, watermark_target)
                media_id = "watermark-1"
                media_entries.append(
                    {
                        "id": media_id,
                        "name": watermark_name,
                        "kind": _watermark_kind_from_name(watermark_name),
                        "path": f"media/{watermark_name}",
                        "import_mode": "copy",
                        "imported_at": now,
                    }
                )
                watermark_payload = {
                    "enabled": True,
                    "mediaId": media_id,
                    "posX": 100,
                    "posY": 100,
                    "scale": 0.08,
                    "opacity": 60,
                }

        project = Project.model_validate(
            {
                "version": 1,
                "name": record.name,
                "created_at": now,
                "updated_at": now,
                "audio": "voice.wav",
                "transcript": {"kind": "plain_text", "path": "transcript.txt"},
                "output": _output_for_setup_preset(record.output_preset),
                "media": media_entries,
                "layers": [_default_subtitles_layer()],
                "subtitles": None,
                "watermark": watermark_payload,
            }
        )
        save_config_snapshot(
            project_dir,
            project.model_dump(mode="json", by_alias=True, exclude_none=False),
        )
        if record.alignment_staged_path is not None:
            alignment_source = Path(record.alignment_staged_path)
            if alignment_source.is_file():
                shutil.copy2(alignment_source, project_dir / ".vc" / "alignment.json")
                if record.alignment.hash:
                    (project_dir / ".vc" / "alignment.hash").write_text(
                        record.alignment.hash,
                        encoding="utf-8",
                    )
        touch_recent(project_dir, record.name)
        set_project_thumbnail(project_dir, _ensure_placeholder_thumbnail(project_dir, record.name))
        _discard_setup_draft(setup_id)
        return ProjectResponse(
            project_id=project_id_for_path(project_dir),
            path=str(project_dir),
            name=record.name,
        )
    except Exception as exc:
        if not existed_before and project_dir.exists():
            shutil.rmtree(project_dir, ignore_errors=True)
        remove_recent(project_dir)
        return _error(
            500,
            "PROJECT_CREATE_FAILED",
            "Project creation failed.",
            {"error": str(exc)},
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


def _load_recent_card_project(project_dir: Path) -> Project | None:
    try:
        config = latest_config_for_project_path(project_dir)
    except (OSError, json.JSONDecodeError, ValidationError, ValueError):
        return None
    if config is not None:
        try:
            return Project.model_validate(config)
        except ValidationError:
            return None
    return _load_recent_project(project_dir)


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
        media_files = [entry for entry in media_dir.iterdir() if entry.is_file()]
        if media_files:
            return len(media_files)
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
async def create_project(
    response: Response,
    payload: CreateProjectRequest | None = None,
    setup_session_id: str | None = Cookie(default=None, alias=SETUP_SESSION_COOKIE),
) -> ProjectResponse | JSONResponse:
    if payload is not None and payload.model_extra:
        return _error(
            400,
            "PROJECT_CREATE_PAYLOAD_FORBIDDEN",
            "Create projects from the active Setup session; do not send path, name, or setup_id.",
            {},
        )

    if setup_session_id is None:
        return _error(
            400,
            "SETUP_SESSION_REQUIRED",
            "Complete Setup before creating a project.",
            {},
        )

    result = _materialize_project_from_setup_draft(setup_session_id)
    if isinstance(result, JSONResponse):
        _discard_setup_draft(setup_session_id)
        clear_setup_session_cookie(result)
        return result
    clear_setup_session_cookie(response)
    return result


@router.get("", response_model=RecentProjectsPage)
async def projects(
    page_size: int = Query(default=20, ge=1, le=100),
    page_index: int = Query(default=0, ge=0),
) -> RecentProjectsPage:
    rows = _valid_project_rows()
    total_count = len(rows)
    start = page_index * page_size
    page_rows = rows[start:start + page_size]
    total_pages = (total_count + page_size - 1) // page_size if total_count else 0
    return RecentProjectsPage(
        items=[_project_card(row) for row in page_rows],
        pagination=PaginationMeta(
            page_size=page_size,
            page_index=page_index,
            total_count=total_count,
            total_pages=total_pages,
        ),
    )


@router.get("/{project_id}/thumbnail/{filename}", response_model=None)
async def project_thumbnail(project_id: str, filename: str) -> FileResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    safe_name = Path(filename).name
    if safe_name != filename:
        return _error(
            400,
            "INVALID_THUMBNAIL",
            "Thumbnail filename is invalid.",
            {"filename": filename},
        )
    thumb = _thumbs_dir(project_dir) / safe_name
    if not thumb.is_file():
        return _error(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.", {"filename": filename})
    media_type = mimetypes.guess_type(thumb.name)[0] or "application/octet-stream"
    return FileResponse(str(thumb), media_type=media_type)


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
    enabled: bool = True
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
            "position": "bottom",
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
    remove_project(project_id)
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
        config = _ensure_subtitles_layer_config(config)
        config_hash = save_config_snapshot(project_dir, config)
    else:
        config = _ensure_subtitles_layer_config(config)
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


EDITOR_DEFAULT_RENDER_RESOLUTION = "1920x1080"


@router.get("/{project_id}/render-cache", response_model=RenderCacheResponse)
async def get_render_cache(project_id: str) -> RenderCacheResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir

    cached, total, has_invalid = _render_cache_counts(project_dir)
    if has_invalid:
        state = "invalid"
    elif total == 0 or cached == 0:
        state = "cold"
    elif cached == total:
        state = "warm"
    else:
        state = "partial"

    return RenderCacheResponse(
        project_id=project_id,
        cached_count=cached,
        total_count=total,
        state=state,
    )


def _render_cache_counts(project_dir: Path) -> tuple[int, int, bool]:
    project = _load_recent_card_project(project_dir)
    if project is None:
        return (0, 0, False)

    output_preset = getattr(project.output, "preset", None)
    preset_value = getattr(output_preset, "value", output_preset)
    preset: Literal["draft", "final"] = "final" if preset_value == "final" else "draft"
    preset_config = PRESETS[preset]
    resolution = _render_cache_resolution(
        getattr(project.output, "resolution", None),
        preset_config.resolution,
        missing_fallback=EDITOR_DEFAULT_RENDER_RESOLUTION,
    )
    fps = _render_cache_fps(getattr(project.output, "fps", None), preset_config.fps)
    crf = preset_config.crf

    total = 0
    cached = 0
    has_invalid = False
    for item in visual_items_bottom_to_top(project):
        total += 1
        try:
            path = clip_cache_path_for_item(
                item=item,
                project_dir=project_dir,
                resolution=resolution,
                fps=fps,
                crf=crf,
            )
        except FileNotFoundError:
            # Missing media for an expected visual clip is a real invalid cache condition.
            has_invalid = True
            continue
        exists = path.is_file() and path.stat().st_size > 0
        if exists:
            cached += 1
        status = _clip_item_cache_status(item)
        # Stale "invalid" should not force invalid once the expected cache output exists.
        if status == "orphaned":
            has_invalid = True
        elif status == "invalid" and not exists:
            has_invalid = True
    return (cached, total, has_invalid)


def _render_cache_resolution(
    output_resolution: object,
    fallback: str,
    *,
    missing_fallback: str = EDITOR_DEFAULT_RENDER_RESOLUTION,
) -> str:
    mapping = {
        "1080p": "1920x1080",
        "720p": "1280x720",
        "9:16": "1080x1920",
        "1920x1080": "1920x1080",
        "1280x720": "1280x720",
        "1080x1920": "1080x1920",
    }
    candidate = getattr(output_resolution, "value", output_resolution)
    if candidate is None:
        return missing_fallback
    value = mapping.get(str(candidate))
    return value if value is not None else fallback


def _render_cache_fps(output_fps: object, fallback: int) -> int:
    if isinstance(output_fps, int | float) and output_fps > 0:
        return max(1, round(float(output_fps)))
    return fallback


def _clip_item_cache_status(item: ClipRenderItem) -> str | None:
    raw = getattr(item, "root", item)
    if isinstance(raw, dict):
        value = raw.get("cache_status")
    else:
        value = getattr(raw, "cache_status", None)
    if value is None:
        return None
    candidate = getattr(value, "value", value)
    if not isinstance(candidate, str):
        return None
    return candidate
