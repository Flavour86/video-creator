"""Build ffmpeg compose commands from cached visual clips."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from server.domain.project import Project
from server.domain.timing import AlignmentResult
from server.pipeline.clip_render import ClipRenderItem, clip_cache_path_for_item

RenderPreset = Literal["draft", "final"]


@dataclass(frozen=True)
class PresetConfig:
    resolution: str
    fps: int
    crf: int
    x264_preset: str
    audio_bitrate: str


PRESETS: dict[RenderPreset, PresetConfig] = {
    "draft": PresetConfig(
        resolution="1280x720",
        fps=30,
        crf=28,
        x264_preset="ultrafast",
        audio_bitrate="128k",
    ),
    "final": PresetConfig(
        resolution="1920x1080",
        fps=30,
        crf=18,
        x264_preset="slow",
        audio_bitrate="192k",
    ),
}


def build_compose_command(
    *,
    project_dir: Path,
    project: Project,
    alignment: AlignmentResult,
    output_path: Path,
    preset: RenderPreset,
) -> list[str]:
    config = PRESETS[preset]
    items = visual_items_bottom_to_top(project)
    cmd = ["ffmpeg", "-y", "-i", str(project_dir / project.audio)]
    for item in items:
        cmd.extend(
            [
                "-i",
                str(
                    clip_cache_path_for_item(
                        item=item,
                        project_dir=project_dir,
                        resolution=config.resolution,
                        fps=config.fps,
                        crf=config.crf,
                    )
                ),
            ]
        )
    watermark_path = _watermark_path(project_dir, project)
    watermark_input_index = None
    if watermark_path is not None:
        watermark_input_index = len(items) + 1
        cmd.extend(["-loop", "1", "-i", str(watermark_path)])

    filtergraph = _build_filtergraph(
        duration_s=_duration_s(project, alignment),
        config=config,
        items=items,
        subtitles_path=project_dir / ".vc" / "subtitles.srt" if _burns_subtitles(project) else None,
        watermark=project.watermark,
        watermark_input_index=watermark_input_index,
    )
    cmd.extend(
        [
            "-filter_complex",
            filtergraph,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-c:v",
            "libx264",
            "-preset",
            config.x264_preset,
            "-crf",
            str(config.crf),
            "-c:a",
            "aac",
            "-b:a",
            config.audio_bitrate,
            "-shortest",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )
    return cmd


def visual_items_bottom_to_top(project: Project) -> list[ClipRenderItem]:
    return [*_fullscreen_items_bottom_to_top(project), *_pip_items_bottom_to_top(project)]


def _fullscreen_items_bottom_to_top(project: Project) -> list[ClipRenderItem]:
    items: list[ClipRenderItem] = []
    for layer_container in reversed(project.layers):
        layer = getattr(layer_container, "root", layer_container)
        kind = getattr(layer, "kind", None)
        if kind not in {"bg", "fg"}:
            continue
        layer_items = getattr(layer, "items", [])
        if not isinstance(layer_items, list):
            continue
        items.extend(layer_items)
    return items


def _pip_items_bottom_to_top(project: Project) -> list[ClipRenderItem]:
    items: list[ClipRenderItem] = []
    for layer_container in reversed(project.layers):
        layer = getattr(layer_container, "root", layer_container)
        if getattr(layer, "kind", None) != "pip":
            continue
        layer_items = getattr(layer, "items", [])
        if not isinstance(layer_items, list):
            continue
        items.extend(layer_items)
    return items


def _duration_s(project: Project, alignment: AlignmentResult) -> float:
    if alignment.sentences:
        return max(sentence.end_s for sentence in alignment.sentences)
    item_ends = [_item_float(item, "end") for item in visual_items_bottom_to_top(project)]
    if item_ends:
        return max(item_ends)
    return 0.001


def _build_filtergraph(
    *,
    duration_s: float,
    config: PresetConfig,
    items: list[ClipRenderItem],
    subtitles_path: Path | None = None,
    watermark: object | None = None,
    watermark_input_index: int | None = None,
) -> str:
    segments = [
        f"color=black:s={config.resolution}:r={config.fps}:d={_fmt(duration_s)}[bg]",
    ]
    current = "bg"
    for input_index, item in enumerate(items, start=1):
        next_label = f"v{input_index}"
        start_s = _fmt(_item_float(item, "start"))
        end_s = _fmt(_item_float(item, "end"))
        if _is_pip_item(item):
            pip = _pip_placement(item)
            opacity = _placement_float(pip, "opacity") / 100
            pos_x = _placement_float(pip, "pos_x") / 100
            pos_y = _placement_float(pip, "pos_y") / 100
            pip_label = f"pip{input_index}"
            segments.append(
                f"[{input_index}:v]format=rgba,"
                f"colorchannelmixer=aa={_fmt(opacity)}[{pip_label}]"
            )
            segments.append(
                f"[{current}][{pip_label}]"
                f"overlay=x='(W-w)*{_fmt(pos_x)}':y='(H-h)*{_fmt(pos_y)}':"
                f"enable='between(t,{start_s},{end_s})':eof_action=pass"
                f"[{next_label}]"
            )
        else:
            segments.append(
                f"[{current}][{input_index}:v]"
                f"overlay=enable='between(t,{start_s},{end_s})':eof_action=pass"
                f"[{next_label}]"
            )
        current = next_label
    if subtitles_path is not None:
        segments.append(
            f"[{current}]subtitles='{_escape_subtitles_path(subtitles_path)}':"
            f"force_style='{_subtitle_force_style()}'[vsub]"
        )
        current = "vsub"
    if watermark is not None and watermark_input_index is not None:
        next_label = "vwm"
        width = int(config.resolution.split("x", maxsplit=1)[0])
        scale = _watermark_float(watermark, "scale")
        opacity = _watermark_float(watermark, "opacity") / 100
        pos_x = _watermark_float(watermark, "pos_x")
        pos_y = _watermark_float(watermark, "pos_y")
        segments.append(
            f"[{watermark_input_index}:v]"
            f"scale={_fmt(width * scale)}:-1,"
            f"format=rgba,colorchannelmixer=aa={_fmt(opacity)}[wm]"
        )
        segments.append(
            f"[{current}][wm]overlay="
            f"x='(W-w)*{_fmt(pos_x / 100)}':"
            f"y='(H-h)*{_fmt(pos_y / 100)}':eof_action=pass"
            f"[{next_label}]"
        )
        current = next_label
    segments.append(f"[{current}]format=yuv420p[vout]")
    segments.append("[0:a]aformat=sample_rates=48000:channel_layouts=stereo[aout]")
    return ";".join(segments)


def _burns_subtitles(project: Project) -> bool:
    subtitles = getattr(project, "subtitles", None)
    return bool(getattr(subtitles, "burn_in", False))


def _escape_subtitles_path(path: Path) -> str:
    return path.resolve().as_posix().replace(":", r"\:").replace("'", r"\'")


def _subtitle_force_style() -> str:
    return ",".join(
        [
            "Fontname=Arial",
            "Fontsize=28",
            "PrimaryColour=&H00FFFFFF",
            "OutlineColour=&H00000000",
            "BorderStyle=1",
            "Outline=2",
            "Shadow=1",
            "Alignment=2",
            "MarginV=60",
        ]
    )


def _watermark_path(project_dir: Path, project: Project) -> Path | None:
    watermark = getattr(project, "watermark", None)
    if watermark is None:
        return None
    media_id = getattr(watermark, "media_id", "")
    safe_name = Path(media_id).name
    if not media_id or safe_name != media_id or ".." in media_id:
        raise ValueError(f"Invalid watermark mediaId: {media_id}")
    return project_dir / "media" / safe_name


def _watermark_float(watermark: object, name: str) -> float:
    value = getattr(watermark, name)
    if not isinstance(value, int | float):
        raise TypeError(f"Watermark {name} must be numeric.")
    return float(value)


def _item_float(item: ClipRenderItem, name: str) -> float:
    if isinstance(item, Mapping):
        value = item[name]
    else:
        value = getattr(item, name)
    if not isinstance(value, int | float):
        raise TypeError(f"Visual item {name} must be numeric.")
    return float(value)


def _is_pip_item(item: ClipRenderItem) -> bool:
    try:
        _pip_placement(item)
    except (AttributeError, KeyError):
        return False
    return True


def _pip_placement(item: ClipRenderItem) -> object:
    if isinstance(item, Mapping):
        return item["pip"]
    return object.__getattribute__(item, "pip")


def _placement_float(placement: object, name: str) -> float:
    if isinstance(placement, Mapping):
        value = placement.get(name)
        if value is None:
            value = placement.get({"pos_x": "posX", "pos_y": "posY"}.get(name, name))
    else:
        value = getattr(placement, name)
    if not isinstance(value, int | float):
        raise TypeError(f"PiP placement {name} must be numeric.")
    return float(value)


def _fmt(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")
