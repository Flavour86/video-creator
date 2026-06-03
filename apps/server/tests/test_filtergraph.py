"""Filtergraph builder tests for T5.3."""

from __future__ import annotations

from pathlib import Path
from time import perf_counter

import pytest

from server.domain.project import Project
from server.domain.timing import AlignedSentence, AlignmentResult
from server.pipeline.cache import clip_cache_key, clip_cache_path
from server.pipeline.clip_render import clip_cache_path_for_item
from server.pipeline.filtergraph import build_compose_command


@pytest.fixture(autouse=True)
def _stub_audio_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("server.pipeline.filtergraph._probe_audio_duration_s", lambda path: 10.0)


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


def _bg_layer(layer_id: str, items: list[dict[str, object]]) -> dict[str, object]:
    return {"id": layer_id, "kind": "bg", "name": layer_id, "items": items}


def _pip_layer(layer_id: str, items: list[dict[str, object]]) -> dict[str, object]:
    return {"id": layer_id, "kind": "pip", "name": layer_id, "items": items}


def _project(
    layers: list[dict[str, object]],
    subtitles: dict[str, object] | None = None,
    watermark: dict[str, object] | None = None,
    media: list[dict[str, object]] | None = None,
) -> Project:
    return Project.model_validate(
        {
            "version": 1,
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "media": media or [],
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


def _expected_clip(
    project_dir: Path,
    media_path: Path,
    duration_s: float,
    *,
    crossfade_s: float | None = None,
    transition_in: str = "cut",
    transition_out: str = "cut",
) -> Path:
    key = clip_cache_key(
        media_path=media_path,
        duration_s=duration_s,
        motion={"kind": "none", "easing": "linear"},
        transition_in=transition_in,
        transition_out=transition_out,
        resolution="1280x720",
        fps=30,
        crf=28,
        crossfade_s=crossfade_s,
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


@pytest.mark.parametrize(
    ("preset", "resolution", "expected_size", "expected_crf"),
    [
        ("final", None, "1920x1080", "18"),
        ("draft", None, "1280x720", "28"),
        ("final", "1080x1920", "1080x1920", "18"),
    ],
)
def test_compose_command_uses_spec_mp4_outputs(
    tmp_path: Path,
    preset: str,
    resolution: str | None,
    expected_size: str,
    expected_crf: str,
) -> None:
    project = _project([])
    output_path = tmp_path / "out.mp4"

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=output_path,
        preset=preset,
        resolution=resolution,
    )

    assert f"color=black:s={expected_size}:r=30:d=10[bg]" in _filtergraph(command)
    assert command[command.index("-c:v") + 1] == "libx264"
    assert command[command.index("-crf") + 1] == expected_crf
    assert command[command.index("-movflags") + 1] == "+faststart"
    assert command[-1] == str(output_path)


def test_compose_duration_uses_audio_when_alignment_is_shorter(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("server.pipeline.filtergraph._probe_audio_duration_s", lambda path: 300.3)
    project = _project([])

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(duration_s=210.1),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert "color=black:s=1280x720:r=30:d=300.3[bg]" in _filtergraph(command)


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
    assert "[1:v]setpts=PTS+1.5/TB[clip1]" in filtergraph
    assert "[bg][clip1]overlay=enable='between(t,1.5,3)':eof_action=pass[v1]" in filtergraph
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
    assert "[1:v]setpts=PTS+1/TB[clip1]" in filtergraph
    assert "[2:v]setpts=PTS+4/TB[clip2]" in filtergraph
    assert "[bg][clip1]overlay=enable='between(t,1,2)':eof_action=pass[v1]" in filtergraph
    assert "[v1][clip2]overlay=enable='between(t,4,6)':eof_action=pass[v2]" in filtergraph


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
                "position": "bottom",
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
    assert "/subtitles.srt':force_style='Fontname=Arial,Fontsize=28" in filtergraph
    assert "Alignment=2,MarginV=60'[vsub];[vsub]format=yuv420p[vout]" in filtergraph


def test_subtitle_style_fields_are_mapped_to_force_style(tmp_path: Path) -> None:
    project = _project(
        [],
        subtitles={
            "burn_in": True,
            "style": {
                "font": "Helvetica Neue",
                "size": 36,
                "position": "top",
                "max_chars_per_line": 30,
                "bg_style": "block",
                "color": "#ffcc00",
                "bg_color": "#102030",
                "bg_opacity": 62,
                "bg_radius": 14,
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
    assert "Fontname=Helvetica Neue,Fontsize=36" in filtergraph
    assert "Alignment=8,MarginV=40" in filtergraph
    assert "PrimaryColour=&H0000CCFF" in filtergraph
    assert "OutlineColour=&H61302010" in filtergraph
    assert "BackColour=&H61302010" in filtergraph
    assert "BorderStyle=4,Outline=0,Shadow=0" in filtergraph
    assert "Radius" not in filtergraph


def test_subtitle_burn_in_false_skips_subtitles_filter(tmp_path: Path) -> None:
    project = _project(
        [],
        subtitles={
            "burn_in": False,
            "style": {
                "font": "Arial",
                "size": 28,
                "position": "bottom",
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


def test_video_watermark_uses_video_looping_input(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path, "logo.mp4", b"video")
    project = _project(
        [],
        watermark={
            "mediaId": "logo.mp4",
            "posX": 90,
            "posY": 10,
            "scale": 0.08,
            "opacity": 80,
        },
        media=[{
            "id": "logo.mp4",
            "name": "logo.mp4",
            "kind": "watermark_video",
            "path": "media/logo.mp4",
            "import_mode": "copy",
            "imported_at": "2026-05-27T00:00:00Z",
        }],
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    watermark_input_path_index = command.index(str(media_path))
    assert command[watermark_input_path_index - 3:watermark_input_path_index + 1] == [
        "-stream_loop",
        "-1",
        "-i",
        str(media_path),
    ]


def test_disabled_watermark_preserves_config_but_does_not_render_overlay(tmp_path: Path) -> None:
    _write_media(tmp_path, "logo.png", b"logo")
    project = _project(
        [],
        watermark={
            "enabled": False,
            "mediaId": "logo.png",
            "posX": 25,
            "posY": 75,
            "scale": 0.16,
            "opacity": 42,
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [str(tmp_path / "voice.wav")]
    assert "[wm]" not in _filtergraph(command)


def test_missing_watermark_media_does_not_render_overlay(tmp_path: Path) -> None:
    project = _project(
        [],
        watermark={
            "mediaId": "missing-logo.png",
            "posX": 25,
            "posY": 75,
            "scale": 0.16,
            "opacity": 42,
        },
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [str(tmp_path / "voice.wav")]
    assert "[wm]" not in _filtergraph(command)


def test_filter_chain_order_is_black_bg_fg_pip_subtitles_watermark(tmp_path: Path) -> None:
    _write_media(tmp_path, "bg.jpg", b"bg")
    _write_media(tmp_path, "fg.jpg", b"fg")
    _write_media(tmp_path, "pip.png", b"pip")
    _write_media(tmp_path, "logo.png", b"logo")
    project = _project(
        [
            _pip_layer(
                "pip-top",
                [
                    {
                        **_item("pip.png", 2.0, 4.0, "pip-1"),
                        "pip": {"posX": 50, "posY": 20, "size": 22, "radius": 16, "opacity": 70},
                    }
                ],
            ),
            _fg_layer("fg-z1", [_item("fg.jpg", 1.0, 5.0, "fg-1")]),
            _bg_layer("bg-z0", [{**_item("bg.jpg", 0.0, 10.0, "bg-1"), "crossfade": 0.0}]),
        ],
        subtitles={
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 28,
                "position": "bottom",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
        watermark={
            "mediaId": "logo.png",
            "posX": 90,
            "posY": 90,
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
    assert "color=black:s=1280x720:r=30:d=10[bg]" in filtergraph
    bg_overlay = filtergraph.index("[bg][clip1]overlay=enable='between(t,0,10)':eof_action=pass[v1]")
    fg_overlay = filtergraph.index("[v1][clip2]overlay=enable='between(t,1,5)':eof_action=pass[v2]")
    pip_overlay = filtergraph.index(
        "[v2][pip3]overlay=x='(W-w)*0.5':y='(H-h)*0.2':enable='between(t,2,4)':eof_action=pass[v3]"
    )
    subtitles_overlay = filtergraph.index("[v3]subtitles='")
    watermark_overlay = filtergraph.index("[vsub][wm]overlay=")
    assert bg_overlay < fg_overlay < pip_overlay < subtitles_overlay < watermark_overlay


def test_single_background_playlist_item_expands_for_render_cache(tmp_path: Path) -> None:
    bg0 = _write_media(tmp_path, "bg0.jpg", b"bg0")
    bg1 = _write_media(tmp_path, "bg1.jpg", b"bg1")
    project = _project(
        [
            _bg_layer(
                "bg-z0",
                [
                    {
                        "id": "bg-playlist",
                        "mediaIds": ["bg0.jpg", "bg1.jpg"],
                        "sentences": [1, 1],
                        "start": 0.0,
                        "end": 10.0,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "crossfade": 0.0,
                    }
                ],
            ),
        ]
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(_expected_clip(tmp_path, bg0, 5.0, crossfade_s=0.0)),
        str(_expected_clip(tmp_path, bg1, 5.0, crossfade_s=0.0)),
    ]
    filtergraph = _filtergraph(command)
    assert "[bg][clip1]overlay=enable='between(t,0,5)':eof_action=pass[v1]" in filtergraph
    assert "[v1][clip2]overlay=enable='between(t,5,10)':eof_action=pass[v2]" in filtergraph


def test_background_image_playlist_crossfade_overlaps_adjacent_slots(tmp_path: Path) -> None:
    bg0 = _write_media(tmp_path, "bg0.jpg", b"bg0")
    bg1 = _write_media(tmp_path, "bg1.jpg", b"bg1")
    project = _project(
        [
            _bg_layer(
                "bg-z0",
                [
                    {
                        "id": "bg-playlist",
                        "mediaIds": ["bg0.jpg", "bg1.jpg"],
                        "sentences": [1, 1],
                        "start": 0.0,
                        "end": 10.0,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "crossfade": 1.0,
                    }
                ],
            ),
        ]
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(_expected_clip(tmp_path, bg0, 5.0, crossfade_s=1.0, transition_out="fade")),
        str(_expected_clip(tmp_path, bg1, 6.0, crossfade_s=1.0, transition_in="fade")),
    ]
    filtergraph = _filtergraph(command)
    assert "[bg][clip1]overlay=enable='between(t,0,5)':eof_action=pass[v1]" in filtergraph
    assert "[v1][clip2]overlay=enable='between(t,4,10)':eof_action=pass[v2]" in filtergraph


def test_background_video_playlist_uses_media_durations_then_black_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("server.pipeline.clip_render._probe_media_duration_s", lambda path: 30.0)
    bg0 = _write_media(tmp_path, "bg0.mp4", b"bg0")
    bg1 = _write_media(tmp_path, "bg1.mp4", b"bg1")
    project = _project(
        [
            _bg_layer(
                "bg-z0",
                [
                    {
                        "id": "bg-playlist",
                        "mediaIds": ["bg0.mp4", "bg1.mp4"],
                        "sentences": [1, 1],
                        "start": 0.0,
                        "end": 10.0,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "crossfade": 0.0,
                    }
                ],
            ),
        ],
        media=[
            {
                "id": "bg0.mp4",
                "name": "bg0.mp4",
                "kind": "video",
                "path": "media/bg0.mp4",
                "duration": 4.0,
                "import_mode": "copy",
                "imported_at": "2026-05-28T00:00:00Z",
            },
            {
                "id": "bg1.mp4",
                "name": "bg1.mp4",
                "kind": "video",
                "path": "media/bg1.mp4",
                "duration": 3.0,
                "import_mode": "copy",
                "imported_at": "2026-05-28T00:00:00Z",
            },
        ],
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(_expected_clip(tmp_path, bg0, 4.0, crossfade_s=0.0)),
        str(_expected_clip(tmp_path, bg1, 3.0, crossfade_s=0.0)),
    ]
    filtergraph = _filtergraph(command)
    assert "color=black:s=1280x720:r=30:d=10[bg]" in filtergraph
    assert "[bg][clip1]overlay=enable='between(t,0,4)':eof_action=pass[v1]" in filtergraph
    assert "[v1][clip2]overlay=enable='between(t,4,7)':eof_action=pass[v2]" in filtergraph
    assert "between(t,7,10)" not in filtergraph


def test_single_background_video_uses_media_duration_then_black_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("server.pipeline.clip_render._probe_media_duration_s", lambda path: 30.0)
    bg0 = _write_media(tmp_path, "bg0.mp4", b"bg0")
    project = _project(
        [
            _bg_layer(
                "bg-z0",
                [
                    {
                        "id": "bg-video",
                        "mediaId": "bg0.mp4",
                        "sentences": [1, 1],
                        "start": 0.0,
                        "end": 10.0,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "crossfade": 0.0,
                    }
                ],
            ),
        ],
        media=[
            {
                "id": "bg0.mp4",
                "name": "bg0.mp4",
                "kind": "video",
                "path": "media/bg0.mp4",
                "duration": 4.0,
                "import_mode": "copy",
                "imported_at": "2026-05-28T00:00:00Z",
            },
        ],
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(_expected_clip(tmp_path, bg0, 4.0, crossfade_s=0.0)),
    ]
    filtergraph = _filtergraph(command)
    assert "color=black:s=1280x720:r=30:d=10[bg]" in filtergraph
    assert "[bg][clip1]overlay=enable='between(t,0,4)':eof_action=pass[v1]" in filtergraph
    assert "between(t,4,10)" not in filtergraph


def test_background_video_playlist_crossfade_overlaps_by_configured_duration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("server.pipeline.clip_render._probe_media_duration_s", lambda path: 30.0)
    bg0 = _write_media(tmp_path, "bg0.mp4", b"bg0")
    bg1 = _write_media(tmp_path, "bg1.mp4", b"bg1")
    project = _project(
        [
            _bg_layer(
                "bg-z0",
                [
                    {
                        "id": "bg-playlist",
                        "mediaIds": ["bg0.mp4", "bg1.mp4"],
                        "sentences": [1, 1],
                        "start": 0.0,
                        "end": 10.0,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "crossfade": 1.0,
                    }
                ],
            ),
        ],
        media=[
            {
                "id": "bg0.mp4",
                "name": "bg0.mp4",
                "kind": "video",
                "path": "media/bg0.mp4",
                "duration": 4.0,
                "import_mode": "copy",
                "imported_at": "2026-05-28T00:00:00Z",
            },
            {
                "id": "bg1.mp4",
                "name": "bg1.mp4",
                "kind": "video",
                "path": "media/bg1.mp4",
                "duration": 3.0,
                "import_mode": "copy",
                "imported_at": "2026-05-28T00:00:00Z",
            },
        ],
    )

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    assert _input_paths(command) == [
        str(tmp_path / "voice.wav"),
        str(_expected_clip(tmp_path, bg0, 4.0, crossfade_s=1.0, transition_out="fade")),
        str(_expected_clip(tmp_path, bg1, 3.0, crossfade_s=1.0, transition_in="fade")),
    ]
    filtergraph = _filtergraph(command)
    assert "[bg][clip1]overlay=enable='between(t,0,4)':eof_action=pass[v1]" in filtergraph
    assert "[v1][clip2]overlay=enable='between(t,3,6)':eof_action=pass[v2]" in filtergraph


def test_filtergraph_build_for_50_layers_meets_target(tmp_path: Path) -> None:
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    layers: list[dict[str, object]] = []
    for index in range(50):
        media_path = media_dir / f"fg-{index}.jpg"
        media_path.write_bytes(b"media")
        layers.append(
            _fg_layer(
                f"fg-z{index}",
                [_item(media_path.name, float(index), float(index) + 1.0, f"fg-{index}")],
            )
        )
    project = _project(layers)

    started_at = perf_counter()
    build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(duration_s=60.0),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )
    elapsed_ms = (perf_counter() - started_at) * 1000

    assert elapsed_ms < 50


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
                "position": "bottom",
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
    assert "[1:v]setpts=PTS+1/TB[clip1]" in filtergraph
    assert "[bg][clip1]overlay=enable='between(t,1,5)':eof_action=pass[v1]" in filtergraph
    assert "[2:v]setpts=PTS+2/TB,format=rgba,colorchannelmixer=aa=0.5[pip2]" in filtergraph
    assert (
        "[v1][pip2]overlay=x='(W-w)*0.98':y='(H-h)*0.02':"
        "enable='between(t,2,4)':eof_action=pass[v2]"
    ) in filtergraph
    assert "[v2]subtitles='" in filtergraph


def test_slide_transitions_use_compose_time_overlay_expressions(tmp_path: Path) -> None:
    _write_media(tmp_path, "slide.jpg", b"slide")
    item = {
        **_item("slide.jpg", 1.0, 3.0, "fg-slide"),
        "transitions": {"in": "slide_left", "out": "slide_right"},
    }
    project = _project([_fg_layer("fg-z1", [item])])

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert (
        "overlay=x='if(gt(t,2.6),0+W*1*((t-2.6)/0.4),"
        "if(lt(t-1,0.4),0+W*1*(1-(t-1)/0.4),0))':y='0':"
        "enable='between(t,1,3)'"
    ) in filtergraph


def test_dip_black_adds_fading_black_overlay(tmp_path: Path) -> None:
    _write_media(tmp_path, "dip.jpg", b"dip")
    item = {
        **_item("dip.jpg", 1.0, 3.0, "fg-dip"),
        "transitions": {"in": "dip_black", "out": "dip_black"},
    }
    project = _project([_fg_layer("fg-z1", [item])])

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert "fade=t=out:st=1:d=0.4:alpha=1[dipin1]" in filtergraph
    assert "[v1][dipin1]overlay=enable='between(t,1,1.4)':eof_action=pass[v1dipin]" in filtergraph
    assert "fade=t=in:st=2.6:d=0.4:alpha=1[dipout1]" in filtergraph
    assert "[v1dipin][dipout1]overlay=enable='between(t,2.6,3)':eof_action=pass" in filtergraph


def test_pip_slide_uses_position_as_base_expression(tmp_path: Path) -> None:
    _write_media(tmp_path, "pip.png", b"pip")
    item = {
        **_item("pip.png", 2.0, 4.0, "pip-slide"),
        "transitions": {"in": "slide_right", "out": "cut"},
        "pip": {"posX": 98, "posY": 2, "size": 22, "radius": 16, "opacity": 50},
    }
    project = _project([_pip_layer("pip-z1", [item])])

    command = build_compose_command(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        output_path=tmp_path / "draft.mp4",
        preset="draft",
    )

    filtergraph = _filtergraph(command)
    assert (
        "overlay=x='if(lt(t-2,0.4),(W-w)*0.98+W*-1*(1-(t-2)/0.4),(W-w)*0.98)':"
        "y='(H-h)*0.02':enable='between(t,2,4)'"
    ) in filtergraph
