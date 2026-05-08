"""Content-hash helpers for alignment and clip caches."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from pathlib import Path
from typing import TypeAlias, cast

from pydantic import BaseModel

JsonValue: TypeAlias = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]

CLIP_CACHE_FORMAT_VERSION = 2


def compute_alignment_hash(audio_path: Path, transcript_text: str) -> str:
    """Return hex sha256 of audio bytes + separator + transcript bytes."""
    h = hashlib.sha256()
    with audio_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    h.update(b"\n---\n")
    h.update(transcript_text.encode("utf-8"))
    return h.hexdigest()


def _compute_file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _json_object(value: BaseModel | Mapping[str, JsonValue] | None) -> JsonObject | None:
    if value is None:
        return None
    if isinstance(value, BaseModel):
        return cast(JsonObject, value.model_dump(mode="json", by_alias=True))
    return dict(value)


def clip_cache_components(
    *,
    media_path: Path,
    duration_s: float,
    motion: BaseModel | Mapping[str, JsonValue] | None,
    transition_in: str | None,
    transition_out: str | None,
    resolution: str,
    fps: int,
    crf: int,
    crossfade_s: float | None = None,
) -> JsonObject:
    return {
        "media_sha256": _compute_file_sha256(media_path),
        "duration_s": round(duration_s, 6),
        "motion": _json_object(motion),
        "transition_in": transition_in,
        "transition_out": transition_out,
        "resolution": resolution,
        "fps": fps,
        "crf": crf,
        "crossfade_s": round(crossfade_s, 6) if crossfade_s is not None else None,
        "format_version": CLIP_CACHE_FORMAT_VERSION,
    }


def clip_cache_key_from_components(components: JsonObject) -> str:
    hash_input = json.dumps(components, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(hash_input).hexdigest()


def clip_cache_key(
    *,
    media_path: Path,
    duration_s: float,
    motion: BaseModel | Mapping[str, JsonValue] | None,
    transition_in: str | None,
    transition_out: str | None,
    resolution: str,
    fps: int,
    crf: int,
    crossfade_s: float | None = None,
) -> str:
    return clip_cache_key_from_components(
        clip_cache_components(
            media_path=media_path,
            duration_s=duration_s,
            motion=motion,
            transition_in=transition_in,
            transition_out=transition_out,
            resolution=resolution,
            fps=fps,
            crf=crf,
            crossfade_s=crossfade_s,
        )
    )


def clip_cache_path(project_dir: Path, key: str) -> Path:
    return project_dir / ".vc" / "clips" / f"{key[:16]}.mp4"


def clip_cache_metadata_path(project_dir: Path, key: str) -> Path:
    return clip_cache_path(project_dir, key).with_suffix(".json")


def is_cached(project_dir: Path, key: str) -> bool:
    path = clip_cache_path(project_dir, key)
    return path.is_file() and path.stat().st_size > 0
