"""Filtergraph builder tests for T5.3."""

from __future__ import annotations

from pathlib import Path

from server.domain.project import Project
from server.domain.timing import AlignedSentence, AlignmentResult
from server.pipeline.cache import clip_cache_key, clip_cache_path
from server.pipeline.clip_render import clip_cache_path_for_item
from server.pipeline.filtergraph import build_compose_command


def _alignment(duration_s: float = 10.0) -> AlignmentResult:
    return AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text="One sentence.",
                start_s=0.0,
                end_s=duration_s,
                confidence_avg=1.0,
            )
        ],
        words=[],
        cache_hit=True,
    )


def _item(media_id: str, start: float, end: float, item_id: str = "fg-1") -> dict[str, object]:
    return {
        "id": item_id,
        "mediaId": media_id,
        "sentences": [1, 1],
        "start": start,
        "end": end,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
    }


def _fg_layer(layer_id: str, items: list[dict[str, object]]) -> dict[str, object]:
    return {"id": layer_id, "kind": "fg", "name": layer_id, "items": items}


def _pip_layer(layer_id: str, items: list[dict[str, object]]) -> dict[str, object]:
    return {"id": layer_id, "kind": "pip", "name": layer_id, "items": items}


def _project(
    layers: list[dict[str, object]],
    subtitles: dict[str, object] | None = None,
    watermark: dict[str, object] | None = None,
) -> Project:
    return Project.model_validate(
        {
            "version": 1,
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": layers,
            "subtitles": subtitles,
            "watermark": watermark,
        }
    )


def _write_media(project_dir: Path, name: str, data: bytes) -> Path:
    path = project_dir / "media" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def _filtergraph(command: list[str]) -> str:
    return command[command.index("-filter_complex") + 1]


def _input_paths(command: list[str]) -> list[str]:
    return [command[index + 1] for index, value in enumerate(command) if value == "-i"]


def _expected_clip(project_dir: Path, media_path: Path, duration_s: float) -> Path:
    key = clip_cache_key(
        media_path=media_path,
        duration_s=duration_s,
        motion={"kind": "none", "easing": "linear"},
        transition_in="cut",
        transition_out="cut",
        resolution="1280x720",
        fps=30,
        crf=28,
    )
    return clip_cache_path(project_dir, key)


def test_empty_foreground_uses_black_canvas_and_audio(tmp_path: Path) -> None:
    project = _project([])
    output_path = tmp_path / "draft.mp4"

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=output_path,
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert _input_paths(command) == [str(tmp_path / "voice.wav")]
    assert "color=black:s=1280x720:r=30:d=10[bg]" in filtergraph
    assert "overlay=" not in filtergraph
    assert "[bg]format=yuv420p[vout]" in filtergraph
    assert "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[aout]" in filtergraph


def test_one_foreground_item_adds_overlay_with_timestamps(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path, "one.jpg", b"one")
    project = _project([_fg_layer("fg-z1", [_item("one.jpg", 1.5, 3.0)])])

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    expected_clip = _expected_clip(tmp_path, media_path, 1.5)
    assert _input_paths(command) == [str(tmp_path / "voice.wav"), str(expected_clip)]
    assert "overlay=enable='between(t,1.5,3)':eof_action=pass[v1]" in filtergraph
    assert "[v1]format=yuv420p[vout]" in filtergraph


def test_two_items_add_two_overlays(tmp_path: Path) -> None:
    _write_media(tmp_path, "one.jpg", b"one")
    _write_media(tmp_path, "two.jpg", b"two")
    project = _project(
        [
            _fg_layer(
                "fg-z1",
                [
                    _item("one.jpg", 1.0, 2.0, "fg-1"),
                    _item("two.jpg", 4.0, 6.0, "fg-2"),
                ],
            )
        ]
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert filtergraph.count("overlay=enable=") == 2
    assert "[bg][1:v]overlay=enable='between(t,1,2)':eof_action=pass[v1]" in filtergraph
    assert "[v1][2:v]overlay=enable='between(t,4,6)':eof_action=pass[v2]" in filtergraph


def test_layer_z_order_is_bottom_to_top(tmp_path: Path) -> None:
    bottom_media = _write_media(tmp_path, "bottom.jpg", b"bottom")
    top_media = _write_media(tmp_path, "top.jpg", b"top")
    project = _project(
        [
            _fg_layer("fg-top", [_item("top.jpg", 0.0, 5.0, "top")]),
            _fg_layer("fg-bottom", [_item("bottom.jpg", 0.0, 5.0, "bottom")]),
        ]
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    bottom_clip = _expected_clip(tmp_path, bottom_media, 5.0)
    top_clip = _expected_clip(tmp_path, top_media, 5.0)
    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(bottom_clip),
        str(top_clip),
    ]


def test_subtitle_burn_in_appends_subtitles_filter(tmp_path: Path) -> None:
    project = _project(
        [],
        subtitles={
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 28,
                "position": "bottom-center",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert "subtitles='" in filtergraph
    assert "/.vc/subtitles.srt':force_style='Fontname=Arial,Fontsize=28" in filtergraph
    assert "Alignment=2,MarginV=60'[vsub];[vsub]format=yuv420p[vout]" in filtergraph


def test_subtitle_burn_in_false_skips_subtitles_filter(tmp_path: Path) -> None:
    project = _project(
        [],
        subtitles={
            "burn_in": False,
            "style": {
                "font": "Arial",
                "size": 28,
                "position": "bottom-center",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert "subtitles=" not in _filtergraph(command)


def test_watermark_appends_topmost_overlay(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path, "logo.png", b"logo")
    project = _project(
        [],
        watermark={
            "mediaId": "logo.png",
            "posX": 100,
            "posY": 100,
            "scale": 0.08,
            "opacity": 60,
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert _input_paths(command) == [str(tmp_path / "voice.wav"), str(media_path)]
    assert "[1:v]scale=102.4:-1,format=rgba,colorchannelmixer=aa=0.6[wm]" in filtergraph
    assert "[bg][wm]overlay=x='(W-w)*1':y='(H-h)*1':eof_action=pass[vwm]" in filtergraph
    assert "[vwm]format=yuv420p[vout]" in filtergraph


def test_pip_items_are_overlaid_after_foreground_before_subtitles(tmp_path: Path) -> None:
    fg_media = _write_media(tmp_path, "fg.jpg", b"fg")
    _write_media(tmp_path, "pip.png", b"pip")
    project = _project(
        [
            {
                "id": "sub",
                "kind": "sub",
                "name": "Subtitles",
                "items": [{"id": "sub-auto", "auto": True, "label": "Auto", "style": "default"}],
            },
            _pip_layer(
                "pip-top",
                [
                    {
                        **_item("pip.png", 2.0, 4.0, "pip-1"),
                        "pip": {"posX": 98, "posY": 2, "size": 22, "radius": 16, "opacity": 50},
                    }
                ],
            ),
            _fg_layer("fg-z1", [_item("fg.jpg", 1.0, 5.0, "fg-1")]),
        ],
        subtitles={
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 28,
                "position": "bottom-center",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    fg_clip = _expected_clip(tmp_path, fg_media, 4.0)
    pip_clip = clip_cache_path_for_item(
        item=project.layers[1].root.items[0],
        project_dir=tmp_path,
        resolution="1280x720",
        fps=30,
        crf=28,
    )
    assert _input_paths(command) == [str(tmp_path / "voice.wav"), str(fg_clip), str(pip_clip)]
    assert "[bg][1:v]overlay=enable='between(t,1,5)':eof_action=pass[v1]" in filtergraph
    assert "[2:v]format=rgba,colorchannelmixer=aa=0.5[pip2]" in filtergraph
    assert (
        "[v1][pip2]overlay=x='(W-w)*0.98':y='(H-h)*0.02':"
        "enable='between(t,2,4)':eof_action=pass[v2]"
    ) in filtergraph
    assert "[v2]subtitles='" in filtergraph
