"""Build ffmpeg compose commands from cached visual clips."""

from __future__ import annotations

import subprocess
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Literal

from server.domain.project import Project
from server.domain.timing import AlignmentResult
from server.pipeline.clip_render import ClipRenderItem, clip_cache_path_for_item
from server.settings import uploads_root

RenderPreset = Literal["draft", "final"]
TRANSITION_SECONDS = 0.4


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
    resolution: str | None = None,
) -> list[str]:
    preset_config = PRESETS[preset]
    config = PresetConfig(
        resolution=resolution or preset_config.resolution,
        fps=preset_config.fps,
        crf=preset_config.crf,
        x264_preset=preset_config.x264_preset,
        audio_bitrate=preset_config.audio_bitrate,
    )
    items = visual_items_bottom_to_top(project)
    duration_s = _duration_s(
        project=project,
        alignment=alignment,
        audio_path=project_dir / project.audio,
        items=items,
    )
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
        duration_s=duration_s,
        config=config,
        items=items,
        subtitles_path=project_dir / "subtitles.srt" if _burns_subtitles(project) else None,
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


def _duration_s(
    *,
    project: Project,
    alignment: AlignmentResult,
    audio_path: Path,
    items: list[ClipRenderItem],
) -> float:
    durations = [_probe_audio_duration_s(audio_path)]
    if alignment.sentences:
        durations.append(max(sentence.end_s for sentence in alignment.sentences))
    item_ends = [_item_float(item, "end") for item in items]
    if item_ends:
        durations.append(max(item_ends))
    return max(0.001, *durations)


def _probe_audio_duration_s(audio_path: Path) -> float:
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
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe audio duration failed: {result.stderr.strip()}")
    duration_s = float(result.stdout.strip())
    if duration_s <= 0:
        raise ValueError(f"Audio duration must be positive: {audio_path}")
    return duration_s


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
        timed_input = f"clip{input_index}"
        if _is_pip_item(item):
            pip = _pip_placement(item)
            opacity = _placement_float(pip, "opacity") / 100
            pos_x = f"(W-w)*{_fmt(_placement_float(pip, 'pos_x') / 100)}"
            pos_y = f"(H-h)*{_fmt(_placement_float(pip, 'pos_y') / 100)}"
            x_expr = _slide_x_expr(item, base_x=pos_x)
            pip_label = f"pip{input_index}"
            segments.append(
                f"[{input_index}:v]setpts=PTS+{start_s}/TB,format=rgba,"
                f"colorchannelmixer=aa={_fmt(opacity)}[{pip_label}]"
            )
            segments.append(
                f"[{current}][{pip_label}]"
                f"overlay=x='{x_expr}':y='{pos_y}':"
                f"enable='between(t,{start_s},{end_s})':eof_action=pass"
                f"[{next_label}]"
            )
        else:
            segments.append(f"[{input_index}:v]setpts=PTS+{start_s}/TB[{timed_input}]")
            overlay_args = _fullscreen_overlay_args(item)
            segments.append(
                f"[{current}][{timed_input}]"
                f"overlay={overlay_args}enable='between(t,{start_s},{end_s})':eof_action=pass"
                f"[{next_label}]"
            )
        current = next_label
        current = _append_dip_black_segments(
            segments=segments,
            current=current,
            item=item,
            input_index=input_index,
            config=config,
            duration_s=duration_s,
        )
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
        wm_pos_x = _watermark_float(watermark, "pos_x")
        wm_pos_y = _watermark_float(watermark, "pos_y")
        segments.append(
            f"[{watermark_input_index}:v]"
            f"scale={_fmt(width * scale)}:-1,"
            f"format=rgba,colorchannelmixer=aa={_fmt(opacity)}[wm]"
        )
        segments.append(
            f"[{current}][wm]overlay="
            f"x='(W-w)*{_fmt(wm_pos_x / 100)}':"
            f"y='(H-h)*{_fmt(wm_pos_y / 100)}':eof_action=pass"
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
    project_path = project_dir / "media" / safe_name
    if project_path.is_file():
        return project_path
    return uploads_root() / safe_name


def _watermark_float(watermark: object, name: str) -> float:
    value = getattr(watermark, name)
    if not isinstance(value, int | float):
        raise TypeError(f"Watermark {name} must be numeric.")
    return float(value)


def _item_float(item: ClipRenderItem, name: str) -> float:
    item = _unwrap_root_model(item)
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
    item = _unwrap_root_model(item)
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


def _transition_value(item: ClipRenderItem, name: str) -> str | None:
    item = _unwrap_root_model(item)
    if isinstance(item, Mapping):
        transitions = item["transitions"]
    else:
        transitions = item.transitions
    if isinstance(transitions, Mapping):
        value = transitions.get(name)
        if value is None and name == "in":
            value = transitions.get("in_")
    else:
        value = getattr(transitions, "in_" if name == "in" else name)
    if isinstance(value, Enum):
        return str(value.value)
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError(f"Transition {name} must be a string.")
    return value


def _unwrap_root_model(value: object) -> object:
    return getattr(value, "root", value)


def _fullscreen_overlay_args(item: ClipRenderItem) -> str:
    x_expr = _slide_x_expr(item, base_x="0")
    if x_expr == "0":
        return ""
    return f"x='{x_expr}':y='0':"


def _slide_x_expr(item: ClipRenderItem, *, base_x: str) -> str:
    start_s = _item_float(item, "start")
    end_s = _item_float(item, "end")
    duration_s = end_s - start_s
    if duration_s <= 0:
        return base_x
    transition_s = min(TRANSITION_SECONDS, duration_s / 2)
    transition_in = _transition_value(item, "in")
    transition_out = _transition_value(item, "out")
    expr = base_x
    if transition_in in {"slide_left", "slide_right"}:
        sign = "1" if transition_in == "slide_left" else "-1"
        expr = (
            f"if(lt(t-{_fmt(start_s)},{_fmt(transition_s)}),"
            f"{base_x}+W*{sign}*(1-(t-{_fmt(start_s)})/{_fmt(transition_s)}),{expr})"
        )
    if transition_out in {"slide_left", "slide_right"}:
        sign = "-1" if transition_out == "slide_left" else "1"
        out_start_s = max(start_s, end_s - transition_s)
        expr = (
            f"if(gt(t,{_fmt(out_start_s)}),"
            f"{base_x}+W*{sign}*((t-{_fmt(out_start_s)})/{_fmt(transition_s)}),{expr})"
        )
    return expr


def _append_dip_black_segments(
    *,
    segments: list[str],
    current: str,
    item: ClipRenderItem,
    input_index: int,
    config: PresetConfig,
    duration_s: float,
) -> str:
    result = current
    item_start_s = _item_float(item, "start")
    item_end_s = _item_float(item, "end")
    item_duration_s = item_end_s - item_start_s
    if item_duration_s <= 0:
        return result
    transition_s = min(TRANSITION_SECONDS, item_duration_s / 2)
    if _transition_value(item, "in") == "dip_black":
        result = _append_black_fade_overlay(
            segments=segments,
            current=result,
            label=f"dipin{input_index}",
            output_label=f"v{input_index}dipin",
            config=config,
            duration_s=duration_s,
            fade_kind="out",
            start_s=item_start_s,
            fade_s=transition_s,
        )
    if _transition_value(item, "out") == "dip_black":
        out_start_s = max(item_start_s, item_end_s - transition_s)
        result = _append_black_fade_overlay(
            segments=segments,
            current=result,
            label=f"dipout{input_index}",
            output_label=f"v{input_index}dipout",
            config=config,
            duration_s=duration_s,
            fade_kind="in",
            start_s=out_start_s,
            fade_s=transition_s,
        )
    return result


def _append_black_fade_overlay(
    *,
    segments: list[str],
    current: str,
    label: str,
    output_label: str,
    config: PresetConfig,
    duration_s: float,
    fade_kind: Literal["in", "out"],
    start_s: float,
    fade_s: float,
) -> str:
    end_s = start_s + fade_s
    segments.append(
        f"color=black@1:s={config.resolution}:r={config.fps}:d={_fmt(duration_s)},"
        f"format=rgba,fade=t={fade_kind}:st={_fmt(start_s)}:d={_fmt(fade_s)}:"
        f"alpha=1[{label}]"
    )
    segments.append(
        f"[{current}][{label}]overlay=enable='between(t,{_fmt(start_s)},{_fmt(end_s)})':"
        f"eof_action=pass[{output_label}]"
    )
    return output_label


def _fmt(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")
