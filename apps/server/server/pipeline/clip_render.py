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
)
from server.settings import uploads_root

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
        crf=crf,
    )
    cached_path = _clip_cache_path_for_key(project_dir, key, item)
    if cached_path.is_file() and cached_path.stat().st_size > 0:
        return cached_path
    return render_clip(
        item=item,
        project_dir=project_dir,
        output_path=cached_path,
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
    crf: int = 28,
) -> Path:
    key = clip_cache_key_for_item(
        item=item,
        project_dir=project_dir,
        resolution=resolution,
        fps=fps,
        crf=crf,
    )
    return _clip_cache_path_for_key(project_dir, key, item)


def clip_cache_key_for_item(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    resolution: str = "1280x720",
    fps: int = 30,
    crf: int = 28,
) -> str:
    media_path = _resolve_media_path(project_dir, _media_id(item))
    duration_s = _effective_duration_s(item, media_path)
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
        crf=crf,
        crossfade_s=_crossfade_s(item),
        pip=_pip_value(item),
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
    duration_s = _effective_duration_s(item, media_path)
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
        fade_seconds=_fade_seconds(item),
        pip=_pip_value(item),
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
        has_alpha=_is_pip_item(item),
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
        crf=crf,
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


def _effective_duration_s(item: ClipRenderItem, media_path: Path) -> float:
    requested_s = _duration_s(item)
    if media_path.suffix.lower() not in VIDEO_EXTENSIONS:
        return requested_s
    return min(requested_s, _probe_media_duration_s(media_path))


def _probe_media_duration_s(media_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(media_path),
    ]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe duration failed: {result.stderr.strip()}")
    duration_s = float(result.stdout.strip())
    if duration_s <= 0:
        raise ValueError(f"Media duration must be positive: {media_path}")
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


def _crossfade_s(item: ClipRenderItem) -> float | None:
    try:
        value = _field(item, "crossfade")
    except (AttributeError, KeyError):
        return None
    if not isinstance(value, int | float):
        raise TypeError("Clip item crossfade must be numeric.")
    return float(value)


def _pip_value(item: ClipRenderItem) -> BaseModel | Mapping[str, JsonValue] | None:
    try:
        value = _field(item, "pip")
    except (AttributeError, KeyError):
        return None
    if value is None or isinstance(value, BaseModel):
        return value
    if isinstance(value, Mapping):
        return cast(Mapping[str, JsonValue], value)
    raise TypeError("Clip item pip must be an object or null.")


def _is_pip_item(item: ClipRenderItem) -> bool:
    return _pip_value(item) is not None


def _fade_seconds(item: ClipRenderItem) -> float:
    crossfade_s = _crossfade_s(item)
    if crossfade_s is None or crossfade_s <= 0:
        return FADE_SECONDS
    return crossfade_s


def _resolve_media_path(project_dir: Path, media_id: str) -> Path:
    safe_name = Path(media_id).name
    if safe_name != media_id or ".." in media_id:
        raise ValueError(f"Invalid mediaId for clip render: {media_id}")
    media_path = project_dir / "media" / safe_name
    if not media_path.is_file():
        media_path = uploads_root() / safe_name
    if not media_path.is_file():
        raise FileNotFoundError(f"Media file not found: {safe_name}")
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
    fade_seconds: float,
) -> list[str]:
    filters: list[str] = []
    if transition_in == "fade":
        fade_in = min(fade_seconds, duration_s / 2)
        filters.append(f"fade=t=in:st=0:d={_fmt(fade_in)}")
    if transition_out == "fade":
        fade_out = min(fade_seconds, duration_s / 2)
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
    fade_seconds: float,
    pip: BaseModel | Mapping[str, JsonValue] | None,
) -> str:
    if pip is not None:
        filters = _pip_clip_filters(
            canvas_width=width,
            duration_s=duration_s,
            fps=fps,
            motion_kind=motion_kind,
            media_path=media_path,
            pip=pip,
        )
    else:
        filters = (
            _image_motion_filters(width, height, duration_s, fps, motion_kind)
            if media_path.suffix.lower() in IMAGE_EXTENSIONS
            else _video_fit_filters(width, height, fps)
        )
    filters.extend(_fade_filters(duration_s, transition_in, transition_out, fade_seconds))
    filters.extend(["setsar=1", "format=yuva420p" if pip is not None else "format=yuv420p"])
    return f"[0:v]{','.join(filters)}[vout]"


def _pip_clip_filters(
    *,
    canvas_width: int,
    duration_s: float,
    fps: int,
    motion_kind: str,
    media_path: Path,
    pip: BaseModel | Mapping[str, JsonValue],
) -> list[str]:
    pip_width = max(1, round(canvas_width * _pip_object_float(pip, "size") / 100))
    if media_path.suffix.lower() in IMAGE_EXTENSIONS:
        filters = (
            [
                f"scale={pip_width}:-2:force_original_aspect_ratio=decrease",
                f"fps={fps}",
            ]
            if motion_kind in {"none", "static"}
            else _image_motion_filters(pip_width, pip_width, duration_s, fps, motion_kind)
        )
    else:
        filters = [
            f"scale={pip_width}:-2:force_original_aspect_ratio=decrease",
            f"fps={fps}",
        ]
    radius = max(0.0, _pip_object_float(pip, "radius"))
    filters.append("format=rgba")
    if radius > 0:
        filters.append(f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='{_rounded_alpha_expr(radius)}'")
    return filters


def _pip_object_float(pip: BaseModel | Mapping[str, JsonValue], name: str) -> float:
    if isinstance(pip, BaseModel):
        value = getattr(pip, name)
    else:
        value = pip.get(name)
        if value is None:
            value = pip.get({"pos_x": "posX", "pos_y": "posY"}.get(name, name))
    if not isinstance(value, int | float):
        raise TypeError(f"PiP {name} must be numeric.")
    return float(value)


def _rounded_alpha_expr(radius: float) -> str:
    r = _fmt(radius)
    return (
        f"if(lt(X,{r})*lt(Y,{r})*gt(hypot({r}-X,{r}-Y),{r})"
        f"+gt(X,W-{r})*lt(Y,{r})*gt(hypot(X-(W-{r}),{r}-Y),{r})"
        f"+lt(X,{r})*gt(Y,H-{r})*gt(hypot({r}-X,Y-(H-{r})),{r})"
        f"+gt(X,W-{r})*gt(Y,H-{r})*gt(hypot(X-(W-{r}),Y-(H-{r})),{r}),0,255)"
    )


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
    has_alpha: bool,
) -> list[str]:
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if media_path.suffix.lower() in IMAGE_EXTENSIONS:
        cmd.extend(["-loop", "1", "-i", str(media_path)])
    else:
        cmd.extend(["-i", str(media_path)])
    cmd.extend(
        [
            "-t",
            _fmt(duration_s),
            "-filter_complex",
            filtergraph,
            "-map",
            "[vout]",
            "-an",
        ]
    )
    if has_alpha:
        cmd.extend(
            [
                "-c:v",
                "libvpx-vp9",
                "-pix_fmt",
                "yuva420p",
                "-auto-alt-ref",
                "0",
                "-deadline",
                "realtime",
                "-cpu-used",
                "8",
                "-crf",
                str(crf),
                "-b:v",
                "0",
                "-r",
                str(fps),
                "-frames:v",
                str(_frame_count(duration_s, fps)),
                str(output_path),
            ]
        )
    else:
        cmd.extend(
            [
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
                "-frames:v",
                str(_frame_count(duration_s, fps)),
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )
    return cmd


def _frame_count(duration_s: float, fps: int) -> int:
    return max(1, round(duration_s * fps))


def _write_metadata(
    *,
    item: ClipRenderItem,
    project_dir: Path,
    media_path: Path,
    output_path: Path,
    resolution: str,
    fps: int,
    crf: int,
    command: list[str],
) -> None:
    components = clip_cache_components(
        media_path=media_path,
        duration_s=_effective_duration_s(item, media_path),
        motion=_motion_value(item),
        transition_in=_transition_value(item, "in"),
        transition_out=_transition_value(item, "out"),
        resolution=resolution,
        fps=fps,
        crf=crf,
        crossfade_s=_crossfade_s(item),
        pip=_pip_value(item),
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


def _clip_cache_path_for_key(project_dir: Path, key: str, item: ClipRenderItem) -> Path:
    path = clip_cache_path(project_dir, key)
    if _is_pip_item(item):
        return path.with_suffix(".webm")
    return path
