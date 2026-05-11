"""Media ingest: upload, list, and serve thumbnails."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from server.db.projects import project_path_for_id

router = APIRouter(tags=["media"])

ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".webm"}
)
IMAGE_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def _sanitize(name: str) -> str:
    name = re.sub(r"[/\\]", "_", name)
    name = re.sub(r"\.{2,}", ".", name)
    return name.lstrip(".") or "file"


def _unique_name(dest: Path, name: str) -> str:
    if not (dest / name).exists():
        return name
    stem, suffix = Path(name).stem, Path(name).suffix
    n = 2
    while (dest / f"{stem}-{n}{suffix}").exists():
        n += 1
    return f"{stem}-{n}{suffix}"


async def _make_thumb(src: Path, thumb: Path) -> None:
    thumb.parent.mkdir(parents=True, exist_ok=True)
    vf = (
        "scale=256:144:force_original_aspect_ratio=decrease,"
        "pad=256:144:(ow-iw)/2:(oh-ih)/2:color=black"
    )
    if src.suffix.lower() in IMAGE_EXTENSIONS:
        cmd = ["ffmpeg", "-y", "-i", str(src), "-vf", vf, "-q:v", "5", str(thumb)]
    else:
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            "0",
            "-i",
            str(src),
            "-vframes",
            "1",
            "-vf",
            vf,
            "-q:v",
            "5",
            str(thumb),
        ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()


class MediaItem(BaseModel):
    filename: str
    size: int
    kind: Literal["image", "video"]
    thumb_url: str


def _get_project(project: str) -> Path | JSONResponse:
    d = Path(project)
    if not (d / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})
    return d


def _get_project_id(project_id: str) -> Path | JSONResponse:
    project_dir = project_path_for_id(project_id)
    if project_dir is None or not (project_dir / "project.json").exists():
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project not found.",
            {"project_id": project_id},
        )
    return project_dir


def _build_item(project_dir: Path, f: Path) -> MediaItem:
    ext = f.suffix.lower()
    kind: Literal["image", "video"] = "image" if ext in IMAGE_EXTENSIONS else "video"
    thumb_name = f.stem + ".jpg"
    has_thumb = (project_dir / ".vc" / "thumbs" / thumb_name).exists()
    thumb_url = (
        f"/projects/thumb?project={quote(str(project_dir), safe='')}"
        f"&filename={quote(thumb_name, safe='')}"
        if has_thumb
        else ""
    )
    return MediaItem(filename=f.name, size=f.stat().st_size, kind=kind, thumb_url=thumb_url)


@router.post("/projects/media", response_model=list[MediaItem])
async def upload_media(
    files: Annotated[list[UploadFile], File(...)],
    project: str = Query(...),
) -> list[MediaItem] | JSONResponse:
    result = _get_project(project)
    if isinstance(result, JSONResponse):
        return result
    project_dir: Path = result

    media_dir = project_dir / "media"
    media_dir.mkdir(exist_ok=True)

    items: list[MediaItem] = []
    for upload in files:
        name = _sanitize(upload.filename or "file")
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            return _error(
                400,
                "UNSUPPORTED_TYPE",
                f"File type {ext!r} is not supported.",
                {"filename": upload.filename or ""},
            )
        final = _unique_name(media_dir, name)
        data = await upload.read()
        (media_dir / final).write_bytes(data)
        await _make_thumb(
            media_dir / final,
            project_dir / ".vc" / "thumbs" / (Path(final).stem + ".jpg"),
        )
        items.append(_build_item(project_dir, media_dir / final))

    return items


@router.post("/projects/{project_id}/media", response_model=list[MediaItem])
async def upload_project_media(
    project_id: str,
    files: Annotated[list[UploadFile], File(...)],
) -> list[MediaItem] | JSONResponse:
    result = _get_project_id(project_id)
    if isinstance(result, JSONResponse):
        return result
    return await upload_media(files=files, project=str(result))


@router.get("/projects/media", response_model=list[MediaItem])
async def list_media(project: str = Query(...)) -> list[MediaItem] | JSONResponse:
    result = _get_project(project)
    if isinstance(result, JSONResponse):
        return result
    project_dir: Path = result

    media_dir = project_dir / "media"
    if not media_dir.exists():
        return []

    return [
        _build_item(project_dir, f)
        for f in sorted(media_dir.iterdir())
        if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS
    ]


@router.get("/projects/{project_id}/media", response_model=list[MediaItem])
async def list_project_media(project_id: str) -> list[MediaItem] | JSONResponse:
    result = _get_project_id(project_id)
    if isinstance(result, JSONResponse):
        return result
    return await list_media(project=str(result))


_MEDIA_CONTENT_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}

_AUDIO_CONTENT_TYPES: dict[str, str] = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}


@router.get("/projects/audio", response_model=None)  # FileResponse | JSONResponse union
async def get_audio(
    project: str = Query(...),
    filename: str = Query(...),
) -> FileResponse | JSONResponse:
    # Reject path traversal: filename must not contain separators or dots-only segments
    safe = Path(filename).name
    if safe != filename or ".." in filename:
        return _error(400, "INVALID_FILENAME", "Invalid audio filename.", {"filename": filename})

    audio_path = Path(project) / safe
    if not audio_path.exists() or not audio_path.is_file():
        return _error(404, "AUDIO_NOT_FOUND", "Audio file not found.", {"filename": filename})

    content_type = _AUDIO_CONTENT_TYPES.get(audio_path.suffix.lower(), "audio/wav")
    return FileResponse(
        str(audio_path),
        media_type=content_type,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get("/projects/media-file", response_model=None)
async def get_media_file(
    project: str = Query(...),
    filename: str = Query(...),
) -> FileResponse | JSONResponse:
    safe = Path(filename).name
    if safe != filename or ".." in filename:
        return _error(400, "INVALID_FILENAME", "Invalid filename.", {"filename": filename})
    media_path = Path(project) / "media" / safe
    if not media_path.exists() or not media_path.is_file():
        return _error(404, "MEDIA_NOT_FOUND", "Media file not found.", {"filename": filename})
    content_type = _MEDIA_CONTENT_TYPES.get(media_path.suffix.lower(), "application/octet-stream")
    return FileResponse(str(media_path), media_type=content_type)


@router.get("/projects/thumb", response_model=None)
async def get_thumb(
    project: str = Query(...),
    filename: str = Query(...),
) -> FileResponse | JSONResponse:
    project_dir = Path(project)
    safe_name = re.sub(r"[/\\]", "", filename)
    thumb = project_dir / ".vc" / "thumbs" / safe_name
    if not thumb.exists() or not thumb.is_file():
        return _error(404, "THUMB_NOT_FOUND", "Thumbnail not found.", {"filename": filename})
    return FileResponse(str(thumb), media_type="image/jpeg")
