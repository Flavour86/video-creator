"""Global uploads ingestion route."""
from __future__ import annotations

import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from schemas import (  # type: ignore[import-not-found]
    Dimensions,
    MediaAsset,
    MediaImportMode,
    MediaKind,
)

from server.settings import uploads_root

router = APIRouter(tags=["uploads"])

ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".mp4",
        ".mov",
        ".webm",
        ".wav",
        ".mp3",
        ".m4a",
        ".aac",
        ".ogg",
        ".flac",
    }
)
IMAGE_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})
VIDEO_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".webm"})
KIND_BY_EXTENSION: dict[str, MediaKind] = {
    ".jpg": MediaKind.image,
    ".jpeg": MediaKind.image,
    ".png": MediaKind.image,
    ".webp": MediaKind.image,
    ".mp4": MediaKind.video,
    ".mov": MediaKind.video,
    ".webm": MediaKind.video,
    ".wav": MediaKind.audio,
    ".mp3": MediaKind.audio,
    ".m4a": MediaKind.audio,
    ".aac": MediaKind.audio,
    ".ogg": MediaKind.audio,
    ".flac": MediaKind.audio,
}


class UploadResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    media_id: str = Field(alias="mediaId")
    media: MediaAsset


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


def _safe_upload_path(filename: str) -> Path:
    base = uploads_root().resolve()
    base.mkdir(parents=True, exist_ok=True)
    path = (base / filename).resolve()
    if path.parent != base:
        raise ValueError(filename)
    return path


def _probe_dimensions(path: Path) -> Dimensions | None:
    if path.suffix.lower() not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        return None
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=p=0:s=x",
        str(path),
    ]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if "x" not in raw:
        return None
    width_raw, height_raw = raw.split("x", maxsplit=1)
    try:
        width = int(width_raw)
        height = int(height_raw)
    except ValueError:
        return None
    if width <= 0 or height <= 0:
        return None
    return Dimensions(width=width, height=height)


def _probe_duration(path: Path) -> float | None:
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        return None
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        return None
    if duration < 0:
        return None
    return duration


@router.post("/uploads", response_model=list[UploadResult])
async def upload_assets(
    files: Annotated[list[UploadFile], File(...)],
) -> list[UploadResult] | JSONResponse:
    items: list[UploadResult] = []
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
        final_name = _unique_name(uploads_root(), name)
        try:
            output_path = _safe_upload_path(final_name)
        except ValueError:
            return _error(
                400,
                "INVALID_FILENAME",
                "Invalid upload filename.",
                {"filename": upload.filename or ""},
            )

        data = await upload.read()
        output_path.write_bytes(data)
        media_id = output_path.name
        media = MediaAsset(
            id=media_id,
            name=output_path.name,
            kind=KIND_BY_EXTENSION[output_path.suffix.lower()],
            path=f"uploads/{output_path.name}",
            thumb_path=None,
            dimensions=_probe_dimensions(output_path),
            duration=_probe_duration(output_path),
            size=output_path.stat().st_size,
            hash=None,
            import_mode=MediaImportMode.copy,
            imported_at=datetime.now(UTC),
        )
        items.append(UploadResult(mediaId=media_id, media=media))
    return items
