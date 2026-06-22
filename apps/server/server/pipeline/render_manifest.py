"""Resolved render manifest generation for preview/export parity checks."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any, cast

from server.domain.project import Project
from server.domain.timing import AlignmentResult
from server.pipeline.clip_render import ClipRenderItem
from server.pipeline.filtergraph import (
    TRANSITION_SECONDS,
    _expand_background_playlist_item,
    _item_float,
    _item_id,
    _item_media_ids,
    _limit_items_to_duration,
    _pip_placement,
    _placement_float,
    _subtitle_background_style,
    _subtitle_position_style,
    _subtitle_render_font_size,
    _subtitle_style_float,
    _subtitle_style_opacity,
    _subtitle_style_str,
    _transition_value,
    _watermark_float,
    _watermark_path,
)
from server.pipeline.srt import generate_srt

ManifestBox = dict[str, float]
ManifestLayer = dict[str, object]


def default_manifest_timestamps(
    project: Project,
    alignment: AlignmentResult,
    *,
    duration_limit_s: float | None = None,
) -> list[float]:
    """Return stable sample timestamps around text and visual transitions."""

    timestamps: set[float] = {0.0}
    limit = max(0.001, float(duration_limit_s)) if duration_limit_s is not None else None
    for sentence in alignment.sentences:
        _add_timestamp(timestamps, sentence.start_s + 0.2, limit)
        _add_timestamp(timestamps, (sentence.start_s + sentence.end_s) / 2, limit)

    for item in _iter_visual_items(project):
        start_s = _item_float(item, "start")
        end_s = _item_float(item, "end")
        if limit is not None and start_s >= limit:
            continue
        end_s = min(end_s, limit) if limit is not None else end_s
        if end_s <= start_s:
            continue
        transition_s = min(TRANSITION_SECONDS, (end_s - start_s) / 2)
        _add_timestamp(timestamps, start_s, limit)
        _add_timestamp(timestamps, start_s + min(transition_s / 2, 0.2), limit)
        _add_timestamp(timestamps, max(start_s, end_s - min(transition_s / 2, 0.2)), limit)
        _add_timestamp(timestamps, max(start_s, end_s - (1 / 30)), limit)

    if len(timestamps) == 1 and alignment.sentences:
        final_sentence_end = alignment.sentences[-1].end_s
        _add_timestamp(timestamps, min(final_sentence_end, limit or final_sentence_end), limit)
    return sorted(timestamps)


def build_render_manifest(
    *,
    project_dir: Path,
    project: Project,
    alignment: AlignmentResult,
    resolution: str,
    timestamps: Iterable[float] | None = None,
    duration_limit_s: float | None = None,
    max_line_chars: int = 42,
) -> dict[str, object]:
    width, height = _resolution_dimensions(resolution)
    sample_times = [
        _round_number(value)
        for value in (
            timestamps
            if timestamps is not None
            else default_manifest_timestamps(project, alignment, duration_limit_s=duration_limit_s)
        )
    ]
    safe_times = _normalize_timestamps(sample_times, duration_limit_s=duration_limit_s)
    cues = _parse_srt(generate_srt(alignment, max_line_chars=max_line_chars))
    media_index = _media_index(project)

    return {
        "version": 1,
        "resolution": resolution,
        "frame": {"width": width, "height": height},
        "timestamps": safe_times,
        "samples": [
            _sample_manifest(
                project_dir=project_dir,
                project=project,
                media_index=media_index,
                cues=cues,
                resolution=resolution,
                frame_width=width,
                frame_height=height,
                timestamp=timestamp,
                duration_limit_s=duration_limit_s,
            )
            for timestamp in safe_times
        ],
    }


def write_render_manifest(
    *,
    project_dir: Path,
    render_id: str,
    project: Project,
    alignment: AlignmentResult,
    resolution: str,
    duration_limit_s: float | None = None,
    max_line_chars: int = 42,
) -> Path:
    manifest = build_render_manifest(
        project_dir=project_dir,
        project=project,
        alignment=alignment,
        resolution=resolution,
        duration_limit_s=duration_limit_s,
        max_line_chars=max_line_chars,
    )
    path = project_dir / ".vc" / "manifests" / f"{render_id}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return path


def _sample_manifest(
    *,
    project_dir: Path,
    project: Project,
    media_index: Mapping[str, object],
    cues: list[dict[str, object]],
    resolution: str,
    frame_width: int,
    frame_height: int,
    timestamp: float,
    duration_limit_s: float | None,
) -> dict[str, object]:
    layers: list[ManifestLayer] = [
        {"kind": "black", "bbox": _full_frame_box(frame_width, frame_height), "opacity": 1}
    ]
    draw_order = ["black"]

    background_layers = _background_layers_at(project, timestamp, duration_limit_s=duration_limit_s)
    if background_layers:
        draw_order.append("bg")
        for layer_id, parent_id, item in background_layers:
            layers.append(
                _visual_layer_manifest(
                    kind="bg",
                    layer_id=layer_id,
                    parent_item_id=parent_id,
                    item=item,
                    media_index=media_index,
                    project_dir=project_dir,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    timestamp=timestamp,
                    bbox=_full_frame_box(frame_width, frame_height),
                )
            )

    foreground_layers = _foreground_layers_at(project, timestamp, duration_limit_s=duration_limit_s)
    if foreground_layers:
        draw_order.append("fg")
        for layer_id, item in foreground_layers:
            layers.append(
                _visual_layer_manifest(
                    kind="fg",
                    layer_id=layer_id,
                    parent_item_id=None,
                    item=item,
                    media_index=media_index,
                    project_dir=project_dir,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    timestamp=timestamp,
                    bbox=_full_frame_box(frame_width, frame_height),
                )
            )

    pip_layers = _pip_layers_at(project, timestamp, duration_limit_s=duration_limit_s)
    if pip_layers:
        draw_order.append("pip")
        for layer_id, item in pip_layers:
            media_id = _first_media_id(item)
            bbox = _pip_box(
                project_dir=project_dir,
                media_index=media_index,
                media_id=media_id,
                item=item,
                frame_width=frame_width,
                frame_height=frame_height,
                timestamp=timestamp,
            )
            layers.append(
                _visual_layer_manifest(
                    kind="pip",
                    layer_id=layer_id,
                    parent_item_id=None,
                    item=item,
                    media_index=media_index,
                    project_dir=project_dir,
                    frame_width=frame_width,
                    frame_height=frame_height,
                    timestamp=timestamp,
                    bbox=bbox,
                )
            )

    subtitle_layer = _subtitle_layer_at(project, cues, resolution, timestamp)
    if subtitle_layer is not None:
        draw_order.append("subtitle")
        layers.append(subtitle_layer)

    watermark_layer = _watermark_layer_at(
        project_dir=project_dir,
        project=project,
        media_index=media_index,
        frame_width=frame_width,
        frame_height=frame_height,
        timestamp=timestamp,
    )
    if watermark_layer is not None:
        draw_order.append("watermark")
        layers.append(watermark_layer)

    return {
        "timestamp": timestamp,
        "resolution": resolution,
        "frame": {"width": frame_width, "height": frame_height},
        "drawOrder": draw_order,
        "activeMediaIds": [
            layer["mediaId"] for layer in layers if isinstance(layer.get("mediaId"), str)
        ],
        "layers": layers,
    }


def _visual_layer_manifest(
    *,
    kind: str,
    layer_id: str,
    parent_item_id: str | None,
    item: ClipRenderItem,
    media_index: Mapping[str, object],
    project_dir: Path,
    frame_width: int,
    frame_height: int,
    timestamp: float,
    bbox: ManifestBox,
) -> ManifestLayer:
    media_id = _first_media_id(item)
    opacity = _opacity_at(item, timestamp)
    placement_opacity = 1.0
    if kind == "pip":
        placement_opacity = _placement_float(_pip_placement(item), "opacity") / 100
    transition = _transition_state(item, timestamp)
    source_time = max(0.0, timestamp - _item_float(item, "start"))
    layer: ManifestLayer = {
        "kind": kind,
        "layerId": layer_id,
        "itemId": parent_item_id or _item_id(item),
        "mediaId": media_id,
        "sourceTime": _round_number(source_time),
        "opacity": _round_number(opacity * placement_opacity),
        "bbox": _round_box(bbox),
        "transition": transition,
    }
    render_item_id = _item_id(item)
    if parent_item_id is not None and render_item_id != parent_item_id:
        layer["renderItemId"] = render_item_id
    if kind == "pip":
        placement = _pip_placement(item)
        layer["style"] = {
            "posX": _round_number(_placement_float(placement, "pos_x")),
            "posY": _round_number(_placement_float(placement, "pos_y")),
            "size": _round_number(_placement_float(placement, "size")),
            "radius": _round_number(_placement_float(placement, "radius")),
            "opacity": _round_number(_placement_float(placement, "opacity")),
        }
    dimensions = _media_dimensions(project_dir, media_index, media_id)
    layer["sourceDimensions"] = {"width": dimensions[0], "height": dimensions[1]}
    return layer


def _background_layers_at(
    project: Project,
    timestamp: float,
    *,
    duration_limit_s: float | None,
) -> list[tuple[str, str, ClipRenderItem]]:
    active: list[tuple[str, str, ClipRenderItem]] = []
    for layer in reversed(_project_layers(project)):
        if getattr(layer, "kind", None) != "bg":
            continue
        for item in _layer_items(layer):
            expanded_items = _limit_items_to_duration(
                _expand_background_playlist_item(project, item),
                duration_limit_s,
            )
            parent_id = _item_id(item)
            for expanded in expanded_items:
                if _item_float(expanded, "start") <= timestamp < _item_float(expanded, "end"):
                    active.append((_layer_id(layer), parent_id, expanded))
    return active


def _foreground_layers_at(
    project: Project,
    timestamp: float,
    *,
    duration_limit_s: float | None,
) -> list[tuple[str, ClipRenderItem]]:
    active: list[tuple[str, ClipRenderItem]] = []
    for layer in reversed(_project_layers(project)):
        if getattr(layer, "kind", None) != "fg":
            continue
        for item in _limit_items_to_duration(_layer_items(layer), duration_limit_s):
            if _item_float(item, "start") <= timestamp < _item_float(item, "end"):
                active.append((_layer_id(layer), item))
    return active


def _pip_layers_at(
    project: Project,
    timestamp: float,
    *,
    duration_limit_s: float | None,
) -> list[tuple[str, ClipRenderItem]]:
    active: list[tuple[str, ClipRenderItem]] = []
    for layer in reversed(_project_layers(project)):
        if getattr(layer, "kind", None) != "pip":
            continue
        for item in _limit_items_to_duration(_layer_items(layer), duration_limit_s):
            if _item_float(item, "start") <= timestamp < _item_float(item, "end"):
                active.append((_layer_id(layer), item))
    return active


def _subtitle_layer_at(
    project: Project,
    cues: list[dict[str, object]],
    resolution: str,
    timestamp: float,
) -> ManifestLayer | None:
    subtitles = getattr(project, "subtitles", None)
    if subtitles is None or getattr(subtitles, "burn_in", False) is not True:
        return None
    active = next(
        (
            cue
            for cue in cues
            if isinstance(cue["start"], float)
            and isinstance(cue["end"], float)
            and cue["start"] <= timestamp < cue["end"]
        ),
        None,
    )
    if active is None:
        return None
    style = getattr(subtitles, "style", None)
    font = _subtitle_style_str(style, "font", "Arial")
    source_size = _subtitle_style_float(style, "size", 28.0)
    font_size = _subtitle_render_font_size(source_size)
    position = _subtitle_style_str(style, "position", "bottom")
    bg_style = _subtitle_style_str(style, "bg_style", "shadow")
    alignment, margin_v = _subtitle_position_style(position)
    border_style, outline, shadow = _subtitle_background_style(bg_style, resolution=resolution)
    lines = list(active["lines"]) if isinstance(active["lines"], list) else []
    return {
        "kind": "subtitle",
        "text": str(active["text"]),
        "lines": lines,
        "opacity": 1,
        "style": {
            "font": font,
            "sourceSize": _round_number(source_size),
            "fontSize": _round_number(font_size),
            "color": _subtitle_style_str(style, "color", "#ffffff"),
            "position": position,
            "maxCharsPerLine": getattr(style, "max_chars_per_line", 42),
            "bgStyle": bg_style,
            "bgColor": _subtitle_style_str(style, "bg_color", "#000000"),
            "bgOpacity": _round_number(_subtitle_style_opacity(style, "bg_opacity", 62.0)),
            "bgRadius": _round_number(_subtitle_style_float(style, "bg_radius", 8.0)),
            "assAlignment": alignment,
            "assMarginV": margin_v,
            "assBorderStyle": border_style,
            "assOutline": outline,
            "assShadow": shadow,
        },
    }


def _watermark_layer_at(
    *,
    project_dir: Path,
    project: Project,
    media_index: Mapping[str, object],
    frame_width: int,
    frame_height: int,
    timestamp: float,
) -> ManifestLayer | None:
    watermark = getattr(project, "watermark", None)
    if watermark is None or getattr(watermark, "enabled", True) is False:
        return None
    if _watermark_path(project_dir, project) is None:
        return None
    media_id = str(watermark.media_id)
    dimensions = _media_dimensions(project_dir, media_index, media_id)
    width = min(max(_watermark_float(watermark, "scale"), 0.02), 0.5) * frame_width
    height = width * (dimensions[1] / max(dimensions[0], 1))
    clamped_pos_x = min(max(_watermark_float(watermark, "pos_x"), 0), 100)
    clamped_pos_y = min(max(_watermark_float(watermark, "pos_y"), 0), 100)
    bbox = {
        "x": ((frame_width - width) * clamped_pos_x) / 100,
        "y": ((frame_height - height) * clamped_pos_y) / 100,
        "width": width,
        "height": height,
    }
    return {
        "kind": "watermark",
        "mediaId": media_id,
        "sourceTime": _round_number(timestamp),
        "opacity": _round_number(_watermark_float(watermark, "opacity") / 100),
        "bbox": _round_box(bbox),
        "sourceDimensions": {"width": dimensions[0], "height": dimensions[1]},
        "style": {
            "posX": _round_number(_watermark_float(watermark, "pos_x")),
            "posY": _round_number(_watermark_float(watermark, "pos_y")),
            "scale": _round_number(_watermark_float(watermark, "scale")),
        },
    }


def _pip_box(
    *,
    project_dir: Path,
    media_index: Mapping[str, object],
    media_id: str,
    item: ClipRenderItem,
    frame_width: int,
    frame_height: int,
    timestamp: float,
) -> ManifestBox:
    placement = _pip_placement(item)
    width = (min(max(_placement_float(placement, "size"), 15), 60) / 100) * frame_width
    dimensions = _media_dimensions(project_dir, media_index, media_id)
    height = width * (dimensions[1] / max(dimensions[0], 1))
    translate_x = _transition_translate_x(item, timestamp)
    clamped_pos_x = min(max(_placement_float(placement, "pos_x"), 0), 100)
    clamped_pos_y = min(max(_placement_float(placement, "pos_y"), 0), 100)
    return {
        "x": ((frame_width - width) * clamped_pos_x) / 100
        + (translate_x / 100) * frame_width,
        "y": ((frame_height - height) * clamped_pos_y) / 100,
        "width": width,
        "height": height,
    }


def _transition_state(item: ClipRenderItem, timestamp: float) -> dict[str, object]:
    start_s = _item_float(item, "start")
    end_s = _item_float(item, "end")
    duration = min(TRANSITION_SECONDS, max((end_s - start_s) / 2, 0))
    if duration <= 0:
        return {"duration": 0, "kind": "cut", "phase": "stable", "progress": 1, "translateX": 0}
    elapsed = timestamp - start_s
    remaining = end_s - timestamp
    transition_in = _transition_value(item, "in") or "cut"
    transition_out = _transition_value(item, "out") or "cut"
    if transition_in != "cut" and elapsed < duration:
        return {
            "duration": _round_number(duration),
            "kind": transition_in,
            "phase": "in",
            "progress": _round_number(min(max(elapsed / duration, 0), 1)),
            "translateX": _round_number(_transition_translate_x(item, timestamp)),
        }
    if transition_out != "cut" and remaining < duration:
        return {
            "duration": _round_number(duration),
            "kind": transition_out,
            "phase": "out",
            "progress": _round_number(min(max(1 - remaining / duration, 0), 1)),
            "translateX": _round_number(_transition_translate_x(item, timestamp)),
        }
    return {
        "duration": _round_number(duration),
        "kind": "cut",
        "phase": "stable",
        "progress": 1,
        "translateX": 0,
    }


def _opacity_at(item: ClipRenderItem, timestamp: float) -> float:
    start_s = _item_float(item, "start")
    end_s = _item_float(item, "end")
    duration = min(TRANSITION_SECONDS, max((end_s - start_s) / 2, 0))
    if duration <= 0:
        return 1.0
    if _transition_value(item, "in") == "fade" and timestamp - start_s < duration:
        return min(max((timestamp - start_s) / duration, 0), 1)
    if _transition_value(item, "out") == "fade" and end_s - timestamp < duration:
        return min(max((end_s - timestamp) / duration, 0), 1)
    return 1.0


def _transition_translate_x(item: ClipRenderItem, timestamp: float) -> float:
    start_s = _item_float(item, "start")
    end_s = _item_float(item, "end")
    duration = min(TRANSITION_SECONDS, max((end_s - start_s) / 2, 0))
    if duration <= 0:
        return 0.0
    elapsed = timestamp - start_s
    remaining = end_s - timestamp
    if _transition_value(item, "in") == "slide_left" and elapsed < duration:
        return (1 - elapsed / duration) * 100
    if _transition_value(item, "in") == "slide_right" and elapsed < duration:
        return -(1 - elapsed / duration) * 100
    if _transition_value(item, "out") == "slide_left" and remaining < duration:
        return -(1 - remaining / duration) * 100
    if _transition_value(item, "out") == "slide_right" and remaining < duration:
        return (1 - remaining / duration) * 100
    return 0.0


def _media_index(project: Project) -> dict[str, object]:
    index: dict[str, object] = {}
    for item in getattr(project, "media", []) or []:
        for key in ("id", "name"):
            value = getattr(item, key, None)
            if isinstance(value, str) and value:
                index[value] = item
    return index


def _media_dimensions(
    project_dir: Path,
    media_index: Mapping[str, object],
    media_id: str,
) -> tuple[int, int]:
    media = media_index.get(media_id)
    dimensions = getattr(media, "dimensions", None) if media is not None else None
    width = getattr(dimensions, "width", None)
    height = getattr(dimensions, "height", None)
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        return (width, height)

    path = _media_path(project_dir, media, media_id)
    if path is not None:
        probed = _probe_media_dimensions(path)
        if probed is not None:
            return probed
    return (16, 9)


def _media_path(project_dir: Path, media: object | None, media_id: str) -> Path | None:
    media_path = getattr(media, "path", None) if media is not None else None
    candidates: list[Path] = []
    if isinstance(media_path, str) and media_path:
        path = Path(media_path)
        candidates.append(path if path.is_absolute() else project_dir / path)
    safe_name = Path(media_id).name
    if safe_name == media_id and ".." not in media_id:
        candidates.append(project_dir / "media" / safe_name)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _probe_media_dimensions(path: Path) -> tuple[int, int] | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=s=x:p=0",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    raw_width, _, raw_height = result.stdout.strip().partition("x")
    try:
        width = int(raw_width)
        height = int(raw_height)
    except ValueError:
        return None
    if width <= 0 or height <= 0:
        return None
    return (width, height)


def _parse_srt(content: str) -> list[dict[str, object]]:
    cues: list[dict[str, object]] = []
    blocks = [block for block in content.replace("\r\n", "\n").split("\n\n") if block.strip()]
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if len(lines) < 3:
            continue
        start_s, end_s = _parse_srt_timing(lines[1])
        cue_lines = lines[2:]
        cues.append(
            {
                "start": start_s,
                "end": end_s,
                "lines": cue_lines,
                "text": _join_subtitle_lines(cue_lines),
            }
        )
    return cues


def _join_subtitle_lines(lines: list[str]) -> str:
    text = ""
    for line in lines:
        if not line:
            continue
        if text and _needs_subtitle_space(text[-1], line[0]):
            text += " "
        text += line
    return text


def _needs_subtitle_space(previous: str, current: str) -> bool:
    return not (
        _is_cjk(previous)
        or _is_cjk(current)
        or current in ".,!?;:\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u3001)]}\u3011\u300b"
        or previous in "([{\u3010\u300a"
    )


def _is_cjk(character: str) -> bool:
    codepoint = ord(character)
    return 0x3400 <= codepoint <= 0x4DBF or 0x4E00 <= codepoint <= 0x9FFF or 0xF900 <= codepoint <= 0xFAFF


def _parse_srt_timing(value: str) -> tuple[float, float]:
    left, right = value.split("-->", maxsplit=1)
    return (_parse_srt_timestamp(left.strip()), _parse_srt_timestamp(right.strip()))


def _parse_srt_timestamp(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000


def _project_layers(project: Project) -> list[Any]:
    return [getattr(layer, "root", layer) for layer in project.layers]


def _iter_visual_items(project: Project) -> Iterable[ClipRenderItem]:
    for layer in _project_layers(project):
        if getattr(layer, "kind", None) not in {"bg", "fg", "pip"}:
            continue
        yield from _layer_items(layer)


def _layer_id(layer: Any) -> str:
    return str(layer.id)


def _layer_items(layer: Any) -> list[ClipRenderItem]:
    return cast(list[ClipRenderItem], layer.items or [])


def _first_media_id(item: ClipRenderItem) -> str:
    media_ids = _item_media_ids(item)
    if not media_ids:
        raise ValueError(f"Visual item has no mediaId: {_item_id(item)}")
    return media_ids[0]


def _normalize_timestamps(
    timestamps: Iterable[float],
    *,
    duration_limit_s: float | None,
) -> list[float]:
    limit = max(0.001, float(duration_limit_s)) if duration_limit_s is not None else None
    safe: set[float] = set()
    for value in timestamps:
        if not isinstance(value, int | float):
            continue
        timestamp = max(0.0, float(value))
        if limit is not None:
            timestamp = min(timestamp, max(0.0, limit - 1 / 30))
        safe.add(_round_number(timestamp))
    return sorted(safe)


def _add_timestamp(values: set[float], timestamp: float, limit: float | None) -> None:
    if timestamp < 0:
        return
    if limit is not None and timestamp >= limit:
        timestamp = max(0.0, limit - 1 / 30)
    values.add(_round_number(timestamp))


def _resolution_dimensions(resolution: str) -> tuple[int, int]:
    width, height = resolution.split("x", maxsplit=1)
    return int(width), int(height)


def _full_frame_box(width: int, height: int) -> ManifestBox:
    return {"x": 0, "y": 0, "width": float(width), "height": float(height)}


def _round_box(box: ManifestBox) -> ManifestBox:
    return {
        "x": _round_number(box["x"]),
        "y": _round_number(box["y"]),
        "width": _round_number(box["width"]),
        "height": _round_number(box["height"]),
    }


def _round_number(value: float) -> float:
    return round(float(value), 3)
