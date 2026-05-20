"""Global uploads ingestion route."""
from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
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
        ".rmvb",
        ".flv",
        ".wav",
        ".mp3",
        ".m4a",
        ".aac",
        ".ogg",
        ".flac",
    }
)
IMAGE_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})
VIDEO_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".webm", ".rmvb", ".flv"})
KIND_BY_EXTENSION: dict[str, MediaKind] = {
    ".jpg": MediaKind.image,
    ".jpeg": MediaKind.image,
    ".png": MediaKind.image,
    ".webp": MediaKind.image,
    ".mp4": MediaKind.video,
    ".mov": MediaKind.video,
    ".webm": MediaKind.video,
    ".rmvb": MediaKind.video,
    ".flv": MediaKind.video,
    ".wav": MediaKind.audio,
    ".mp3": MediaKind.audio,
    ".m4a": MediaKind.audio,
    ".aac": MediaKind.audio,
    ".ogg": MediaKind.audio,
    ".flac": MediaKind.audio,
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_IMAGE_EDGE_PX = 5
_CHUNK_DIRNAME = ".chunks"
_META_DIRNAME = ".meta"


class UploadResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    media_id: str = Field(alias="mediaId")
    media: MediaAsset


_MEDIA_CONTENT_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".rmvb": "application/vnd.rn-realmedia-vbr",
    ".flv": "video/x-flv",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
}


def _meta_root() -> Path:
    root = uploads_root().resolve()
    meta = (root / _META_DIRNAME).resolve()
    meta.mkdir(parents=True, exist_ok=True)
    return meta


def _metadata_path(filename: str) -> Path:
    name = _safe_filename(filename)
    if not name:
        raise ValueError(filename)
    meta = _meta_root()
    path = (meta / f"{name}.json").resolve()
    if path.parent != meta:
        raise ValueError(filename)
    return path


def _chunks_root() -> Path:
    root = uploads_root().resolve()
    chunks = (root / _CHUNK_DIRNAME).resolve()
    chunks.mkdir(parents=True, exist_ok=True)
    return chunks


def _chunk_dir(upload_id: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", upload_id).strip("._")
    if not safe:
        raise ValueError(upload_id)
    base = _chunks_root()
    path = (base / safe).resolve()
    if path.parent != base:
        raise ValueError(upload_id)
    return path


def _chunk_path(upload_id: str, chunk_index: int) -> Path:
    chunk_dir = _chunk_dir(upload_id)
    chunk_dir.mkdir(parents=True, exist_ok=True)
    path = (chunk_dir / f"{chunk_index:08d}.part").resolve()
    if path.parent != chunk_dir:
        raise ValueError(upload_id)
    return path


def _cleanup_chunks(upload_id: str) -> None:
    try:
        shutil.rmtree(_chunk_dir(upload_id), ignore_errors=True)
    except ValueError:
        return


def _write_media_metadata(media: MediaAsset) -> None:
    path = _metadata_path(media.id)
    payload = media.model_dump(mode="json", by_alias=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _read_media_metadata(path: Path) -> MediaAsset | None:
    try:
        meta_path = _metadata_path(path.name)
        if not meta_path.exists() or not meta_path.is_file():
            return None
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
        media = MediaAsset.model_validate(payload)
    except (json.JSONDecodeError, OSError, ValueError):
        return None
    return media


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


def _upload_thumb_path(filename: str) -> Path:
    base = uploads_root().resolve()
    thumbs = (base / ".thumbs").resolve()
    thumbs.mkdir(parents=True, exist_ok=True)
    candidate = (thumbs / f"{Path(filename).stem}.jpg").resolve()
    if candidate.parent != thumbs:
        raise ValueError(filename)
    return candidate


def _safe_filename(value: str) -> str | None:
    safe = Path(value).name
    if safe != value or ".." in value:
        return None
    return safe


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _find_duplicate_by_hash(file_hash: str) -> Path | None:
    root = uploads_root()
    if not root.is_dir():
        return None
    for candidate in root.iterdir():
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        try:
            if _sha256_file(candidate) == file_hash:
                return candidate
        except OSError:
            continue
    return None


def _make_thumb(src: Path, thumb: Path) -> bool:
    if src.suffix.lower() not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        return False
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
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    return result.returncode == 0 and thumb.is_file() and thumb.stat().st_size > 0


def _parse_imported_at(value: str | None, fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


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


def _media_asset_for_path(
    output_path: Path,
    *,
    content_hash: str,
    imported_at_override: str | None = None,
) -> MediaAsset | JSONResponse:
    ext = output_path.suffix.lower()
    dimensions = _probe_dimensions(output_path)
    if ext in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS and dimensions is None:
        return _error(
            400,
            "CORRUPT_MEDIA",
            "Could not read media metadata. The file may be corrupted.",
            {"filename": output_path.name},
        )
    if (
        ext in IMAGE_EXTENSIONS
        and dimensions is not None
        and (dimensions.width < MIN_IMAGE_EDGE_PX or dimensions.height < MIN_IMAGE_EDGE_PX)
    ):
        return _error(
            400,
            "IMAGE_TOO_SMALL",
            "Image dimensions are too small.",
            {
                "filename": output_path.name,
                "min_width": str(MIN_IMAGE_EDGE_PX),
                "min_height": str(MIN_IMAGE_EDGE_PX),
            },
        )
    duration = _probe_duration(output_path)
    if ext in VIDEO_EXTENSIONS and duration is None:
        return _error(
            400,
            "CORRUPT_MEDIA",
            "Could not read video duration. The file may be corrupted.",
            {"filename": output_path.name},
        )
    thumb_rel_path: str | None = None
    thumb_path = _upload_thumb_path(output_path.name)
    if _make_thumb(output_path, thumb_path):
        thumb_rel_path = f"uploads/.thumbs/{thumb_path.name}"
    imported_at = _parse_imported_at(
        imported_at_override,
        datetime.fromtimestamp(output_path.stat().st_mtime, tz=UTC),
    )
    return MediaAsset(
        id=output_path.name,
        name=output_path.name,
        kind=KIND_BY_EXTENSION[ext],
        path=f"uploads/{output_path.name}",
        thumb_path=thumb_rel_path,
        dimensions=dimensions,
        duration=duration,
        size=output_path.stat().st_size,
        hash=content_hash,
        import_mode=MediaImportMode.copy,
        imported_at=imported_at,
    )


def _build_duplicate_result(duplicate: Path, *, content_hash: str) -> UploadResult | JSONResponse:
    stored = _read_media_metadata(duplicate)
    if stored is not None and stored.hash == content_hash:
        return UploadResult(mediaId=duplicate.name, media=stored)
    media = _media_asset_for_path(
        duplicate,
        content_hash=content_hash,
        imported_at_override=stored.imported_at if stored is not None else None,
    )
    if isinstance(media, JSONResponse):
        return media
    _write_media_metadata(media)
    return UploadResult(mediaId=duplicate.name, media=media)


def _assemble_chunks(
    upload_id: str,
    *,
    chunk_count: int,
    assembled_path: Path,
) -> tuple[str, int] | JSONResponse:
    digest = hashlib.sha256()
    total = 0
    with assembled_path.open("wb") as destination:
        for index in range(chunk_count):
            part_path = _chunk_path(upload_id, index)
            if not part_path.exists() or not part_path.is_file():
                return _error(
                    400,
                    "CHUNK_MISSING",
                    "Missing upload chunk.",
                    {"upload_id": upload_id, "chunk_index": str(index)},
                )
            with part_path.open("rb") as source:
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    destination.write(chunk)
                    digest.update(chunk)
                    total += len(chunk)
    return digest.hexdigest(), total


@router.post("/uploads", response_model=list[UploadResult])
async def upload_assets(
    files: Annotated[list[UploadFile], File(...)],
    upload_id: Annotated[str | None, Form()] = None,
    chunk_index: Annotated[int | None, Form()] = None,
    chunk_count: Annotated[int | None, Form()] = None,
    original_name: Annotated[str | None, Form()] = None,
    original_size: Annotated[int | None, Form()] = None,
) -> list[UploadResult] | JSONResponse:
    root = uploads_root().resolve()
    root.mkdir(parents=True, exist_ok=True)
    is_chunked = any(
        value is not None
        for value in (upload_id, chunk_index, chunk_count, original_name, original_size)
    )

    if is_chunked:
        if upload_id is None or chunk_index is None or chunk_count is None or original_name is None:
            return _error(
                400,
                "CHUNK_FIELDS_REQUIRED",
                "Chunk uploads require upload_id, chunk_index, chunk_count, and original_name.",
                {},
            )
        if chunk_count <= 0 or chunk_index < 0 or chunk_index >= chunk_count:
            return _error(
                400,
                "INVALID_CHUNK_INDEX",
                "Invalid chunk index or chunk count.",
                {"chunk_index": str(chunk_index), "chunk_count": str(chunk_count)},
            )
        if len(files) != 1:
            return _error(
                400,
                "CHUNK_SINGLE_FILE_REQUIRED",
                "Chunk upload requests must include exactly one file chunk.",
                {"files": str(len(files))},
            )
        upload = files[0]
        name = _sanitize(original_name)
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            return _error(
                400,
                "UNSUPPORTED_TYPE",
                f"File type {ext!r} is not supported.",
                {"filename": original_name},
            )
        data = await upload.read()
        if len(data) > MAX_UPLOAD_BYTES:
            return _error(
                413,
                "CHUNK_TOO_LARGE",
                "Chunk exceeds maximum upload size.",
                {"max_upload_bytes": str(MAX_UPLOAD_BYTES), "chunk_size": str(len(data))},
            )
        try:
            chunk_path = _chunk_path(upload_id, chunk_index)
        except ValueError:
            return _error(400, "INVALID_UPLOAD_ID", "Invalid upload_id.", {"upload_id": upload_id})
        chunk_path.write_bytes(data)
        if chunk_index < chunk_count - 1:
            return []
        chunk_dir = _chunk_dir(upload_id)
        assembled_path = (chunk_dir / "assembled.bin").resolve()
        if assembled_path.parent != chunk_dir:
            _cleanup_chunks(upload_id)
            return _error(400, "INVALID_UPLOAD_ID", "Invalid upload_id.", {"upload_id": upload_id})
        assembled = _assemble_chunks(
            upload_id,
            chunk_count=chunk_count,
            assembled_path=assembled_path,
        )
        if isinstance(assembled, JSONResponse):
            return assembled
        content_hash, total_size = assembled
        if original_size is not None and original_size > 0 and total_size != original_size:
            _cleanup_chunks(upload_id)
            return _error(
                400,
                "CHUNK_SIZE_MISMATCH",
                "Combined chunk size does not match the original file size.",
                {"expected_size": str(original_size), "actual_size": str(total_size)},
            )
        duplicate = _find_duplicate_by_hash(content_hash)
        if duplicate is not None:
            _cleanup_chunks(upload_id)
            duplicate_result = _build_duplicate_result(duplicate, content_hash=content_hash)
            if isinstance(duplicate_result, JSONResponse):
                return duplicate_result
            return [duplicate_result]
        final_name = _unique_name(root, name)
        try:
            output_path = _safe_upload_path(final_name)
        except ValueError:
            _cleanup_chunks(upload_id)
            return _error(
                400,
                "INVALID_FILENAME",
                "Invalid upload filename.",
                {"filename": original_name},
            )
        try:
            assembled_path.replace(output_path)
        except OSError:
            _cleanup_chunks(upload_id)
            return _error(
                500,
                "WRITE_FAILED",
                "Could not store uploaded media.",
                {"filename": final_name},
            )
        _cleanup_chunks(upload_id)
        media = _media_asset_for_path(output_path, content_hash=content_hash)
        if isinstance(media, JSONResponse):
            try:
                output_path.unlink(missing_ok=True)
            except OSError:
                pass
            return media
        _write_media_metadata(media)
        return [UploadResult(mediaId=media.id, media=media)]

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
        data = await upload.read()
        if len(data) > MAX_UPLOAD_BYTES:
            return _error(
                413,
                "FILE_TOO_LARGE",
                "File exceeds maximum upload size.",
                {"max_upload_bytes": str(MAX_UPLOAD_BYTES), "file_size": str(len(data))},
            )
        content_hash = _sha256_bytes(data)
        duplicate = _find_duplicate_by_hash(content_hash)
        if duplicate is not None:
            duplicate_result = _build_duplicate_result(duplicate, content_hash=content_hash)
            if isinstance(duplicate_result, JSONResponse):
                return duplicate_result
            items.append(duplicate_result)
            continue
        final_name = _unique_name(root, name)
        try:
            output_path = _safe_upload_path(final_name)
        except ValueError:
            return _error(
                400,
                "INVALID_FILENAME",
                "Invalid upload filename.",
                {"filename": upload.filename or ""},
            )
        output_path.write_bytes(data)
        media = _media_asset_for_path(output_path, content_hash=content_hash)
        if isinstance(media, JSONResponse):
            try:
                output_path.unlink(missing_ok=True)
            except OSError:
                pass
            return media
        _write_media_metadata(media)
        items.append(UploadResult(mediaId=media.id, media=media))
    return items


@router.get("/uploads/media-file", response_model=None)
async def uploaded_media_file(filename: str) -> JSONResponse | FileResponse:
    safe = _safe_filename(filename)
    if not safe:
        return _error(400, "INVALID_FILENAME", "Invalid filename.", {"filename": filename})
    path = uploads_root() / safe
    if not path.exists() or not path.is_file():
        return _error(404, "MEDIA_NOT_FOUND", "Media file not found.", {"filename": filename})
    media_type = (
        _MEDIA_CONTENT_TYPES.get(path.suffix.lower())
        or mimetypes.guess_type(path.name)[0]
        or "application/octet-stream"
    )
    return FileResponse(str(path), media_type=media_type)


@router.get("/uploads/thumb", response_model=None)
async def uploaded_media_thumb(filename: str) -> JSONResponse | FileResponse:
    safe = _safe_filename(filename)
    if not safe:
        return _error(400, "INVALID_FILENAME", "Invalid filename.", {"filename": filename})
    thumb = uploads_root() / ".thumbs" / f"{Path(safe).stem}.jpg"
    if not thumb.exists() or not thumb.is_file():
        return _error(404, "THUMB_NOT_FOUND", "Thumbnail not found.", {"filename": filename})
    return FileResponse(str(thumb), media_type="image/jpeg")
