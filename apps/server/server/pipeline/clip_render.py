"""Per-clip pre-rendering for the render asset cache."""
from __future__ import annotations

import json
import subprocess
from collections.abc import Mapping
from pathlib import Path
from typing import Protocol, cast

from pydantic import BaseModel

from server.pipeline.cache import (
    JsonValue,
    clip_cache_components,
    clip_cache_key_from_components,
    clip_cache_path,
    is_cached,
)

IMAGE_EXTENSIONS: frozenset[str] = frozenset({".jpg", ".jpeg", ".png", ".webp"})
VIDEO_EXTENSIONS: frozenset[str] = frozenset({".mp4", ".mov", ".webm"})
FADE_SECONDS = 0.4


class ClipItem(Protocol):
    id: str
    media_id: str
    start: float
    end: float
    motion: BaseModel
    transitions: BaseModel


ClipRenderItem = ClipItem | Mapping[str, object]


def render_clip_to_cache(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    resolution: str = "1280x720",
    fps: int = 30,
    crf: int = 28,
) -> Path:
    key = clip_cache_key_for_item(
        item=item,
        project_dir=project_dir,
        resolution=resolution,
        fps=fps,
    )
    if is_cached(project_dir, key):
        return clip_cache_path(project_dir, key)
    return render_clip(
        item=item,
        project_dir=project_dir,
        output_path=clip_cache_path(project_dir, key),
        resolution=resolution,
        fps=fps,
        crf=crf,
    )


def clip_cache_path_for_item(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    resolution: str = "1280x720",
    fps: int = 30,
) -> Path:
    key = clip_cache_key_for_item(
        item=item,
        project_dir=project_dir,
        resolution=resolution,
        fps=fps,
    )
    return clip_cache_path(project_dir, key)


def clip_cache_key_for_item(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    resolution: str = "1280x720",
    fps: int = 30,
) -> str:
    media_path = _resolve_media_path(project_dir, _media_id(item))
    duration_s = _duration_s(item)
    transition_in = _transition_value(item, "in")
    transition_out = _transition_value(item, "out")
    components = clip_cache_components(
        media_path=media_path,
        duration_s=duration_s,
        motion=_motion_value(item),
        transition_in=transition_in,
        transition_out=transition_out,
        resolution=resolution,
        fps=fps,
    )
    return clip_cache_key_from_components(components)


def render_clip(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    output_path: Path,
    resolution: str = "1280x720",
    fps: int = 30,
    crf: int = 28,
) -> Path:
    if output_path.is_file() and output_path.stat().st_size > 0:
        return output_path

    media_path = _resolve_media_path(project_dir, _media_id(item))
    duration_s = _duration_s(item)
    width, height = _parse_resolution(resolution)
    filtergraph = _build_clip_filter(
        media_path=media_path,
        width=width,
        height=height,
        duration_s=duration_s,
        fps=fps,
        motion_kind=_motion_kind(item),
        transition_in=_transition_value(item, "in"),
        transition_out=_transition_value(item, "out"),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(f"{output_path.stem}.tmp{output_path.suffix}")
    if tmp_path.exists():
        tmp_path.unlink()

    cmd = _ffmpeg_command(
        media_path=media_path,
        duration_s=duration_s,
        filtergraph=filtergraph,
        fps=fps,
        crf=crf,
        output_path=tmp_path,
    )
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        if tmp_path.exists():
            tmp_path.unlink()
        raise RuntimeError(f"ffmpeg clip render failed: {result.stderr.strip()}")

    tmp_path.replace(output_path)
    _write_metadata(
        item=item,
        project_dir=project_dir,
        media_path=media_path,
        output_path=output_path,
        resolution=resolution,
        fps=fps,
        command=cmd,
    )
    return output_path


def _field(item: ClipRenderItem, snake_name: str, alias: str | None = None) -> object:
    if isinstance(item, Mapping):
        if snake_name in item:
            return item[snake_name]
        if alias is not None and alias in item:
            return item[alias]
        raise KeyError(snake_name)
    return getattr(item, snake_name)


def _media_id(item: ClipRenderItem) -> str:
    value = _field(item, "media_id", "mediaId")
    if not isinstance(value, str):
        raise TypeError("Clip item media_id must be a string.")
    return value


def _float_field(item: ClipRenderItem, name: str) -> float:
    value = _field(item, name)
    if not isinstance(value, int | float):
        raise TypeError(f"Clip item {name} must be numeric.")
    return float(value)


def _duration_s(item: ClipRenderItem) -> float:
    duration_s = _float_field(item, "end") - _float_field(item, "start")
    if duration_s <= 0:
        raise ValueError("Clip item duration must be positive.")
    return duration_s


def _motion_value(item: ClipRenderItem) -> BaseModel | Mapping[str, JsonValue] | None:
    value = _field(item, "motion")
    if value is None or isinstance(value, BaseModel):
        return value
    if isinstance(value, Mapping):
        return cast(Mapping[str, JsonValue], value)
    raise TypeError("Clip item motion must be an object or null.")


def _motion_kind(item: ClipRenderItem) -> str:
    motion = _motion_value(item)
    if motion is None:
        return "none"
    if isinstance(motion, BaseModel):
        value = motion.model_dump(mode="json").get("kind", "none")
    else:
        value = motion.get("kind", "none")
    if not isinstance(value, str):
        return "none"
    return value


def _transition_value(item: ClipRenderItem, name: str) -> str | None:
    transitions = _field(item, "transitions")
    if isinstance(transitions, BaseModel):
        value = transitions.model_dump(mode="json", by_alias=True).get(name)
    elif isinstance(transitions, Mapping):
        value = transitions.get(name)
        if value is None and name == "in":
            value = transitions.get("in_")
    else:
        raise TypeError("Clip item transitions must be an object.")
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"Clip item transition {name} must be a string.")
    return value


def _resolve_media_path(project_dir: Path, media_id: str) -> Path:
    safe_name = Path(media_id).name
    if safe_name != media_id or ".." in media_id:
        raise ValueError(f"Invalid mediaId for clip render: {media_id}")
    media_path = project_dir / "media" / safe_name
    if not media_path.is_file():
        raise FileNotFoundError(f"Media file not found: {media_path}")
    if media_path.suffix.lower() not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        raise ValueError(f"Unsupported media type for clip render: {media_path.suffix}")
    return media_path


def _parse_resolution(resolution: str) -> tuple[int, int]:
    parts = resolution.lower().split("x")
    if len(parts) != 2:
        raise ValueError(f"Invalid resolution: {resolution}")
    width = int(parts[0])
    height = int(parts[1])
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid resolution: {resolution}")
    return width, height


def _fmt(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")


def _fade_filters(
    duration_s: float,
    transition_in: str | None,
    transition_out: str | None,
) -> list[str]:
    filters: list[str] = []
    if transition_in == "fade":
        fade_in = min(FADE_SECONDS, duration_s / 2)
        filters.append(f"fade=t=in:st=0:d={_fmt(fade_in)}")
    if transition_out == "fade":
        fade_out = min(FADE_SECONDS, duration_s / 2)
        filters.append(f"fade=t=out:st={_fmt(max(0.0, duration_s - fade_out))}:d={_fmt(fade_out)}")
    return filters


def _build_clip_filter(
    *,
    media_path: Path,
    width: int,
    height: int,
    duration_s: float,
    fps: int,
    motion_kind: str,
    transition_in: str | None,
    transition_out: str | None,
) -> str:
    filters = (
        _image_motion_filters(width, height, duration_s, fps, motion_kind)
        if media_path.suffix.lower() in IMAGE_EXTENSIONS
        else _video_fit_filters(width, height, fps)
    )
    filters.extend(_fade_filters(duration_s, transition_in, transition_out))
    filters.extend(["setsar=1", "format=yuv420p"])
    return f"[0:v]{','.join(filters)}[vout]"


def _image_motion_filters(
    width: int,
    height: int,
    duration_s: float,
    fps: int,
    motion_kind: str,
) -> list[str]:
    if motion_kind in {"none", "static"}:
        return _video_fit_filters(width, height, fps)

    frames = max(1, round(duration_s * fps))
    denominator = max(1, frames - 1)
    scaled_width = width * 2
    scaled_height = height * 2
    zoom, x_pos, y_pos = _zoompan_expressions(motion_kind, denominator)
    return [
        f"scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase",
        f"crop={scaled_width}:{scaled_height}",
        f"zoompan=z='{zoom}':x='{x_pos}':y='{y_pos}':d={frames}:s={width}x{height}:fps={fps}",
    ]


def _video_fit_filters(width: int, height: int, fps: int) -> list[str]:
    return [
        f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black",
        f"fps={fps}",
    ]


def _zoompan_expressions(motion_kind: str, denominator: int) -> tuple[str, str, str]:
    center_x = "iw/2-(iw/zoom/2)"
    center_y = "ih/2-(ih/zoom/2)"
    if motion_kind == "ken_burns_strong":
        return f"min(1.18,1+on*0.18/{denominator})", center_x, center_y
    if motion_kind == "zoom_in" or motion_kind == "ken_burns":
        return f"min(1.08,1+on*0.08/{denominator})", center_x, center_y
    if motion_kind == "zoom_out":
        return f"max(1,1.12-on*0.12/{denominator})", center_x, center_y
    if motion_kind == "pan_left":
        return "1.08", f"(iw-iw/zoom)*on/{denominator}", center_y
    if motion_kind == "pan_right":
        return "1.08", f"(iw-iw/zoom)*(1-on/{denominator})", center_y
    return f"min(1.08,1+on*0.08/{denominator})", center_x, center_y


def _ffmpeg_command(
    *,
    media_path: Path,
    duration_s: float,
    filtergraph: str,
    fps: int,
    crf: int,
    output_path: Path,
) -> list[str]:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if media_path.suffix.lower() in IMAGE_EXTENSIONS:
        cmd.extend(["-loop", "1", "-i", str(media_path)])
    else:
        cmd.extend(["-stream_loop", "-1", "-i", str(media_path)])
    cmd.extend(
        [
            "-t",
            _fmt(duration_s),
            "-filter_complex",
            filtergraph,
            "-map",
            "[vout]",
            "-an",
            "-c:v",
            "libx264",
            "-g",
            "1",
            "-keyint_min",
            "1",
            "-preset",
            "ultrafast",
            "-crf",
            str(crf),
            "-r",
            str(fps),
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )
    return cmd


def _write_metadata(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    media_path: Path,
    output_path: Path,
    resolution: str,
    fps: int,
    command: list[str],
) -> None:
    components = clip_cache_components(
        media_path=media_path,
        duration_s=_duration_s(item),
        motion=_motion_value(item),
        transition_in=_transition_value(item, "in"),
        transition_out=_transition_value(item, "out"),
        resolution=resolution,
        fps=fps,
    )
    metadata = {
        "key_components": components,
        "project_dir": str(project_dir),
        "output_path": str(output_path),
        "ffmpeg": command,
    }
    output_path.with_suffix(".json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True),
        encoding="utf-8",
    )
