"""Clip cache key tests for T5.2."""

from __future__ import annotations

import os
from pathlib import Path
from time import perf_counter

import pytest

from server.pipeline.cache import clip_cache_key, clip_cache_path, is_cached
from server.pipeline.clip_render import (
    clip_cache_key_for_item,
    clip_cache_path_for_item,
    render_clip,
    render_clip_to_cache,
)


def _write_media(path: Path, data: bytes = b"media-bytes") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


def test_clip_cache_key_is_deterministic(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path / "media" / "image.jpg")
    motion = {"kind": "ken_burns", "easing": "ease_in_out"}

    first = clip_cache_key(
        media_path=media_path,
        duration_s=4.2,
        motion=motion,
        transition_in="fade",
        transition_out="cut",
        resolution="1280x720",
        fps=30,
        crf=28,
    )
    second = clip_cache_key(
        media_path=media_path,
        duration_s=4.2,
        motion=motion,
        transition_in="fade",
        transition_out="cut",
        resolution="1280x720",
        fps=30,
        crf=28,
    )

    assert first == second
    assert len(first) == 64


def test_clip_cache_key_changes_when_inputs_change(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path / "media" / "image.jpg")
    base_kwargs = {
        "media_path": media_path,
        "duration_s": 4.2,
        "motion": {"kind": "ken_burns", "easing": "ease_in_out"},
        "transition_in": "fade",
        "transition_out": "cut",
        "resolution": "1280x720",
        "fps": 30,
        "crf": 28,
    }
    base_key = clip_cache_key(**base_kwargs)

    assert clip_cache_key(**{**base_kwargs, "duration_s": 5.0}) != base_key
    changed_motion = {"kind": "zoom_in", "easing": "ease_in_out"}
    assert clip_cache_key(**{**base_kwargs, "motion": changed_motion}) != base_key
    assert clip_cache_key(**{**base_kwargs, "transition_in": "cut"}) != base_key
    assert clip_cache_key(**{**base_kwargs, "transition_out": "fade"}) != base_key
    assert clip_cache_key(**{**base_kwargs, "resolution": "1920x1080"}) != base_key
    assert clip_cache_key(**{**base_kwargs, "fps": 24}) != base_key
    assert clip_cache_key(**{**base_kwargs, "crf": 18}) != base_key
    assert clip_cache_key(**{**base_kwargs, "crossfade_s": 0.6}) != base_key

    media_path.write_bytes(b"different-media")
    assert clip_cache_key(**base_kwargs) != base_key


def test_clip_cache_path_and_is_cached(tmp_path: Path) -> None:
    key = "a" * 64
    path = clip_cache_path(tmp_path, key)

    assert path == tmp_path / ".vc" / "clips" / "aaaaaaaaaaaaaaaa.mp4"
    assert is_cached(tmp_path, key) is False

    path.parent.mkdir(parents=True)
    path.write_bytes(b"")
    assert is_cached(tmp_path, key) is False

    path.write_bytes(b"mp4")
    assert is_cached(tmp_path, key) is True


def test_render_clip_to_cache_reuses_existing_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "image.jpg")
    item = {
        "id": "fg-1",
        "media_id": media_path.name,
        "start": 0.0,
        "end": 4.2,
        "motion": {"kind": "ken_burns", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
    }
    key = clip_cache_key(
        media_path=media_path,
        duration_s=4.2,
        motion=item["motion"],
        transition_in="fade",
        transition_out="cut",
        resolution="1280x720",
        fps=30,
        crf=28,
    )
    cached_path = clip_cache_path(tmp_path, key)
    cached_path.parent.mkdir(parents=True)
    cached_path.write_bytes(b"mp4")

    def fail_render(
        *,
        item: object,
        project_dir: Path,
        output_path: Path,
        resolution: str,
        fps: int,
        crf: int,
    ) -> Path:
        raise AssertionError("render_clip should not run on a cache hit")

    monkeypatch.setattr("server.pipeline.clip_render.render_clip", fail_render)

    assert render_clip_to_cache(item=item, project_dir=tmp_path) == cached_path


def test_video_clip_cache_key_uses_probed_duration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "clip.mp4")
    item = {
        "id": "bg-1",
        "media_id": media_path.name,
        "start": 0.0,
        "end": 10.0,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
    }

    monkeypatch.setattr(
        "server.pipeline.clip_render._probe_media_duration_s",
        lambda path: 3.0,
    )

    key = clip_cache_key_for_item(item=item, project_dir=tmp_path)
    expected = clip_cache_key(
        media_path=media_path,
        duration_s=3.0,
        motion=item["motion"],
        transition_in="cut",
        transition_out="cut",
        resolution="1280x720",
        fps=30,
        crf=28,
    )

    assert key == expected


def test_pip_geometry_changes_cache_key_and_uses_alpha_container(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path / "media" / "image.png")
    item = {
        "id": "pip-1",
        "media_id": media_path.name,
        "start": 0.0,
        "end": 4.0,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
        "pip": {"posX": 98, "posY": 2, "size": 22, "radius": 16, "opacity": 50},
    }

    key = clip_cache_key_for_item(item=item, project_dir=tmp_path)
    changed_key = clip_cache_key_for_item(
        item={**item, "pip": {**item["pip"], "size": 30}},
        project_dir=tmp_path,
    )

    assert changed_key != key
    assert clip_cache_path_for_item(item=item, project_dir=tmp_path).suffix == ".webm"


def test_manual_background_schedule_context_changes_cache_key(tmp_path: Path) -> None:
    media_path = _write_media(tmp_path / "media" / "bg.png")
    item = {
        "id": "bg-scheduled-1",
        "media_id": media_path.name,
        "start": 0.0,
        "end": 2.0,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
        "crossfade": 0.0,
        "_cache_context": {
            "kind": "background_schedule",
            "parent_id": "bg-scheduled",
            "segment_id": "seg-bg",
            "media_id": media_path.name,
            "schedule_start_s": 0.0,
            "schedule_end_s": 2.0,
            "render_start_s": 0.0,
            "render_end_s": 2.0,
        },
    }
    shifted = {
        **item,
        "start": 1.0,
        "end": 3.0,
        "_cache_context": {
            **item["_cache_context"],
            "schedule_start_s": 1.0,
            "schedule_end_s": 3.0,
            "render_start_s": 1.0,
            "render_end_s": 3.0,
        },
    }

    assert clip_cache_key_for_item(item=item, project_dir=tmp_path) != clip_cache_key_for_item(
        item=shifted,
        project_dir=tmp_path,
    )


def test_render_pip_clip_encodes_vp9_with_alpha(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "image.png")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        Path(cmd[-1]).write_bytes(b"webm")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "pip-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 4.0,
            "motion": {"kind": "none", "easing": "linear"},
            "transitions": {"in": "cut", "out": "cut"},
            "pip": {"posX": 98, "posY": 2, "size": 22, "radius": 16, "opacity": 50},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "pip.webm",
    )

    ffmpeg_command = commands[0]
    filtergraph = ffmpeg_command[ffmpeg_command.index("-filter_complex") + 1]
    assert "scale=282:-2" in filtergraph
    assert "format=rgba" in filtergraph
    assert "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a=" in filtergraph
    assert "libvpx-vp9" in ffmpeg_command
    assert "yuva420p" in ffmpeg_command


def test_render_fullscreen_clip_crops_to_cover_vertical_canvas(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "foreground.png")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        Path(cmd[-1]).write_bytes(b"webm")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "fg-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 4.0,
            "motion": {"kind": "none", "easing": "linear"},
            "transitions": {"in": "fade", "out": "cut"},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "foreground.webm",
        resolution="1080x1920",
    )

    ffmpeg_command = commands[0]
    filtergraph = ffmpeg_command[ffmpeg_command.index("-filter_complex") + 1]
    assert "scale=1080:1920:force_original_aspect_ratio=increase" in filtergraph
    assert "crop=1080:1920" in filtergraph
    assert "format=rgba,fade=t=in:st=0:d=0.4:alpha=1" in filtergraph
    assert "fade=t=in:st=0:d=0.4:alpha=1" in filtergraph
    assert "format=yuva420p" in filtergraph
    assert "pad=1080:1920" not in filtergraph
    assert "libvpx-vp9" in ffmpeg_command
    assert "yuva420p" in ffmpeg_command


def test_render_video_clip_plays_once_without_looping(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "clip.mp4")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = "3.0"
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"mp4")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "bg-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 10.0,
            "motion": {"kind": "none", "easing": "linear"},
            "transitions": {"in": "cut", "out": "cut"},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "video.mp4",
    )

    ffmpeg_command = next(command for command in commands if command[0] == "ffmpeg")
    assert "-stream_loop" not in ffmpeg_command
    assert ffmpeg_command[ffmpeg_command.index("-t") + 1] == "3"


def test_render_video_motion_advances_one_source_frame_per_output_frame(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "clip.mp4")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = "3.0"
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"mp4")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "bg-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 3.0,
            "motion": {"kind": "ken_burns", "easing": "ease_in_out"},
            "transitions": {"in": "cut", "out": "cut"},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "video.mp4",
    )

    ffmpeg_command = next(command for command in commands if command[0] == "ffmpeg")
    filtergraph = ffmpeg_command[ffmpeg_command.index("-filter_complex") + 1]
    assert "zoompan=" in filtergraph
    assert ":d=1:" in filtergraph
    assert "if(lt(on/89,0.5),2*(on/89)*(on/89),1-pow(-2*(on/89)+2,2)/2)" in filtergraph


def test_render_pan_motion_wraps_easing_expression_precedence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "foreground.jpg")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        Path(cmd[-1]).write_bytes(b"mp4")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "fg-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 3.0,
            "motion": {"kind": "pan_left", "easing": "ease_out"},
            "transitions": {"in": "cut", "out": "cut"},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "foreground.mp4",
    )

    ffmpeg_command = commands[0]
    filtergraph = ffmpeg_command[ffmpeg_command.index("-filter_complex") + 1]
    assert "x='(iw-iw/zoom)*(1-(1-on/89)*(1-on/89))'" in filtergraph


def test_render_pip_motion_preserves_source_aspect_ratio(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_path = _write_media(tmp_path / "media" / "pip.png")
    commands: list[list[str]] = []

    class Result:
        returncode = 0
        stdout = "1600x900"
        stderr = ""

    def fake_run(cmd: list[str], **kwargs: object) -> Result:
        commands.append(cmd)
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"webm")
        return Result()

    monkeypatch.setattr("server.pipeline.clip_render.subprocess.run", fake_run)

    render_clip(
        item={
            "id": "pip-1",
            "media_id": media_path.name,
            "start": 0.0,
            "end": 3.0,
            "motion": {"kind": "zoom_in", "easing": "ease_out"},
            "transitions": {"in": "cut", "out": "cut"},
            "pip": {"posX": 96, "posY": 4, "size": 22, "radius": 4, "opacity": 55},
        },
        project_dir=tmp_path,
        output_path=tmp_path / ".vc" / "clips" / "pip.webm",
    )

    ffmpeg_command = next(command for command in commands if command[0] == "ffmpeg")
    filtergraph = ffmpeg_command[ffmpeg_command.index("-filter_complex") + 1]
    assert "zoompan=" in filtergraph
    assert "s=282x158" in filtergraph
    assert ":d=90:" in filtergraph
    assert "1-(1-on/89)*(1-on/89)" in filtergraph


def test_clip_cache_rebuilds_only_edited_clip_and_reuses_unaffected_clip(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_dir = tmp_path / "media"
    fg_media = _write_media(media_dir / "fg.png")
    pip_media = _write_media(media_dir / "pip.png")
    fg_item = {
        "id": "fg-1",
        "media_id": fg_media.name,
        "start": 0.0,
        "end": 4.0,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
    }
    pip_item = {
        "id": "pip-1",
        "media_id": pip_media.name,
        "start": 4.0,
        "end": 8.0,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
        "pip": {"posX": 75, "posY": 25, "size": 30, "radius": 8, "opacity": 90},
    }
    rendered_outputs: list[Path] = []

    def fake_render(
        *,
        item: object,
        project_dir: Path,
        output_path: Path,
        resolution: str,
        fps: int,
        crf: int,
    ) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"rendered")
        rendered_outputs.append(output_path)
        return output_path

    monkeypatch.setattr("server.pipeline.clip_render.render_clip", fake_render)

    fg_path_before = render_clip_to_cache(item=fg_item, project_dir=tmp_path)
    pip_path_before = render_clip_to_cache(item=pip_item, project_dir=tmp_path)
    assert len(rendered_outputs) == 2
    pip_mtime_before = pip_path_before.stat().st_mtime_ns

    edited_fg = {**fg_item, "motion": {"kind": "zoom_in", "easing": "ease_in_out"}}
    fg_path_after = render_clip_to_cache(item=edited_fg, project_dir=tmp_path)
    pip_path_after = render_clip_to_cache(item=pip_item, project_dir=tmp_path)

    assert len(rendered_outputs) == 3
    assert fg_path_after != fg_path_before
    assert pip_path_after == pip_path_before
    assert pip_path_after.stat().st_mtime_ns == pip_mtime_before


def test_cached_clip_rerender_after_single_property_edit_meets_target(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    media_dir = tmp_path / "media"
    fg_media = _write_media(media_dir / "fg.png")
    pip_media = _write_media(media_dir / "pip.png")
    voice_duration_s = 60.0
    target_ms = voice_duration_s * 0.2 * 1000
    fg_item = {
        "id": "fg-1",
        "media_id": fg_media.name,
        "start": 0.0,
        "end": voice_duration_s,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
    }
    pip_item = {
        "id": "pip-1",
        "media_id": pip_media.name,
        "start": 0.0,
        "end": voice_duration_s,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
        "pip": {"posX": 75, "posY": 25, "size": 30, "radius": 8, "opacity": 90},
    }
    rendered_outputs: list[Path] = []

    def fake_render(
        *,
        item: object,
        project_dir: Path,
        output_path: Path,
        resolution: str,
        fps: int,
        crf: int,
    ) -> Path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"rendered")
        rendered_outputs.append(output_path)
        return output_path

    monkeypatch.setattr("server.pipeline.clip_render.render_clip", fake_render)

    render_clip_to_cache(item=fg_item, project_dir=tmp_path)
    pip_path_before = render_clip_to_cache(item=pip_item, project_dir=tmp_path)
    rendered_outputs.clear()
    edited_fg = {**fg_item, "motion": {"kind": "ken_burns", "easing": "linear"}}

    started_at = perf_counter()
    render_clip_to_cache(item=edited_fg, project_dir=tmp_path)
    pip_path_after = render_clip_to_cache(item=pip_item, project_dir=tmp_path)
    elapsed_ms = (perf_counter() - started_at) * 1000

    assert elapsed_ms < target_ms
    assert rendered_outputs == [clip_cache_path_for_item(item=edited_fg, project_dir=tmp_path)]
    assert pip_path_after == pip_path_before


@pytest.mark.skipif(
    os.environ.get("VC_INTEGRATION") != "1",
    reason="Set VC_INTEGRATION=1 to run ffmpeg clip render integration tests.",
)
def test_render_clip_image_integration(tmp_path: Path) -> None:
    project_dir = tmp_path
    media_path = _write_media(
        project_dir / "media" / "pixel.png",
        data=(
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
            b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
            b"\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
            b"\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
        ),
    )
    item = {
        "id": "fg-1",
        "media_id": media_path.name,
        "start": 0.0,
        "end": 0.5,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
    }

    output_path = project_dir / ".vc" / "clips" / "test.mp4"

    rendered = render_clip(
        item=item,
        project_dir=project_dir,
        output_path=output_path,
        resolution="320x180",
        fps=5,
        crf=35,
    )

    assert rendered == output_path
    assert rendered.stat().st_size > 0
    assert rendered.with_suffix(".json").exists()
