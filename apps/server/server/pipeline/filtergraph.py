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

    filtergraph = _build_filtergraph(
        duration_s=_duration_s(project, alignment),
        config=config,
        items=items,
        subtitles_path=project_dir / ".vc" / "subtitles.srt" if _burns_subtitles(project) else None,
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
) -> str:
    segments = [
        f"color=black:s={config.resolution}:r={config.fps}:d={_fmt(duration_s)}[bg]",
    ]
    current = "bg"
    for input_index, item in enumerate(items, start=1):
        next_label = f"v{input_index}"
        start_s = _fmt(_item_float(item, "start"))
        end_s = _fmt(_item_float(item, "end"))
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


def _item_float(item: ClipRenderItem, name: str) -> float:
    if isinstance(item, Mapping):
        value = item[name]
    else:
        value = getattr(item, name)
    if not isinstance(value, int | float):
        raise TypeError(f"Visual item {name} must be numeric.")
    return float(value)


def _fmt(value: float) -> str:
    return f"{value:.6f}".rstrip("0").rstrip(".")
