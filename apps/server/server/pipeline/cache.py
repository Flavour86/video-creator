"""Content-hash helpers for alignment and clip caches."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from pathlib import Path
from typing import TypeAlias, cast

from pydantic import BaseModel

JsonValue: TypeAlias = None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]

CLIP_CACHE_FORMAT_VERSION = 6
_HAN_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
_KANA_RE = re.compile(r"[\u3040-\u30ff]")
_HANGUL_RE = re.compile(r"[\uac00-\ud7af]")
_CPU_ALIGNMENT_LANGUAGES = frozenset({"zh", "ja", "ko"})


def alignment_language_for_text(transcript_text: str) -> str:
    """Return the WhisperX alignment language implied by transcript text."""
    if _HANGUL_RE.search(transcript_text):
        return "ko"
    if _KANA_RE.search(transcript_text):
        return "ja"
    if _HAN_RE.search(transcript_text):
        return "zh"
    return "en"


def alignment_device_for_language(language: str) -> str | None:
    """Return a preferred forced-alignment device for heavier language models."""
    return "cpu" if language.lower() in _CPU_ALIGNMENT_LANGUAGES else None


def compute_alignment_hash(
    audio_path: Path,
    transcript_text: str,
    *,
    language: str | None = None,
) -> str:
    """Return hex sha256 of audio bytes, transcript bytes, and non-English align language."""
    alignment_language = (language or alignment_language_for_text(transcript_text)).lower()
    h = hashlib.sha256()
    with audio_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    h.update(b"\n---\n")
    h.update(transcript_text.encode("utf-8"))
    if alignment_language != "en":
        h.update(b"\n---alignment-language---\n")
        h.update(alignment_language.encode("utf-8"))
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
    pip: BaseModel | Mapping[str, JsonValue] | None = None,
    cache_context: BaseModel | Mapping[str, JsonValue] | None = None,
) -> JsonObject:
    components: JsonObject = {
        "media_sha256": _compute_file_sha256(media_path),
        "duration_s": round(duration_s, 6),
        "motion": _json_object(motion),
        "transition_in": transition_in,
        "transition_out": transition_out,
        "resolution": resolution,
        "fps": fps,
        "crf": crf,
        "crossfade_s": round(crossfade_s, 6) if crossfade_s is not None else None,
        "pip": _json_object(pip),
        "format_version": CLIP_CACHE_FORMAT_VERSION,
    }
    cache_context_json = _json_object(cache_context)
    if cache_context_json is not None:
        components["cache_context"] = cache_context_json
    return components


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
    pip: BaseModel | Mapping[str, JsonValue] | None = None,
    cache_context: BaseModel | Mapping[str, JsonValue] | None = None,
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
            pip=pip,
            cache_context=cache_context,
        )
    )


def clip_cache_path(project_dir: Path, key: str) -> Path:
    return project_dir / ".vc" / "clips" / f"{key[:16]}.mp4"


def clip_cache_metadata_path(project_dir: Path, key: str) -> Path:
    return clip_cache_path(project_dir, key).with_suffix(".json")


def is_cached(project_dir: Path, key: str) -> bool:
    path = clip_cache_path(project_dir, key)
    return path.is_file() and path.stat().st_size > 0
