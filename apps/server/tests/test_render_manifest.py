from __future__ import annotations

from pathlib import Path

import pytest

from server.domain.project import Project
from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult
from server.pipeline.render_manifest import build_render_manifest


def _alignment() -> AlignmentResult:
    return AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text="One subtitle.",
                start_s=2.0,
                end_s=4.0,
                confidence_avg=1.0,
            )
        ],
        words=[
            AlignedWord(
                sentence_index=1,
                text="One subtitle.",
                start_s=2.0,
                end_s=4.0,
                confidence=1.0,
            )
        ],
        cache_hit=True,
    )


def _visual_item(
    item_id: str,
    media_id: str,
    start: float,
    end: float,
    extra: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "id": item_id,
        "mediaId": media_id,
        "sentences": [1, 1],
        "start": start,
        "end": end,
        "motion": {"kind": "none", "easing": "linear"},
        "transitions": {"in": "cut", "out": "cut"},
        **(extra or {}),
    }


def _project() -> Project:
    media = [
        _media("bg.png", "image", 1280, 720),
        _media("fg.png", "image", 1280, 720),
        _media("pip.png", "image", 400, 200),
        _media("watermark.png", "watermark_image", 240, 120),
    ]
    return Project.model_validate(
        {
            "version": 1,
            "name": "manifest",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "media": media,
            "layers": [
                {
                    "id": "pip-z3",
                    "kind": "pip",
                    "name": "PiP",
                    "items": [
                        _visual_item(
                            "pip-1",
                            "pip.png",
                            2.0,
                            4.0,
                            {
                                "pip": {
                                    "posX": 50,
                                    "posY": 20,
                                    "size": 22,
                                    "radius": 0,
                                    "opacity": 70,
                                }
                            },
                        )
                    ],
                },
                {
                    "id": "fg-z2",
                    "kind": "fg",
                    "name": "Foreground",
                    "items": [_visual_item("fg-1", "fg.png", 1.0, 5.0)],
                },
                {
                    "id": "bg-z1",
                    "kind": "bg",
                    "name": "Background",
                    "items": [_visual_item("bg-1", "bg.png", 0.0, 10.0, {"crossfade": 0})],
                },
            ],
            "subtitles": {
                "burn_in": True,
                "style": {
                    "font": "Arial",
                    "size": 36,
                    "position": "bottom",
                    "max_chars_per_line": 42,
                    "bg_style": "shadow",
                    "color": "#ffffff",
                    "bg_color": "#000000",
                    "bg_opacity": 62,
                    "bg_radius": 8,
                },
            },
            "watermark": {
                "mediaId": "watermark.png",
                "opacity": 100,
                "posX": 100,
                "posY": 0,
                "scale": 0.08,
            },
        }
    )


def _media(name: str, kind: str, width: int, height: int) -> dict[str, object]:
    return {
        "id": name,
        "name": name,
        "kind": kind,
        "path": f"media/{name}",
        "dimensions": {"width": width, "height": height},
        "import_mode": "copy",
        "imported_at": "2026-06-16T00:00:00Z",
    }


def test_render_manifest_samples_export_layer_order_and_geometry(tmp_path: Path) -> None:
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    (media_dir / "watermark.png").write_bytes(b"watermark")

    manifest = build_render_manifest(
        project_dir=tmp_path,
        project=_project(),
        alignment=_alignment(),
        resolution="1280x720",
        timestamps=[2.4],
        max_line_chars=42,
    )

    sample = manifest["samples"][0]
    assert sample["drawOrder"] == ["black", "bg", "fg", "pip", "subtitle", "watermark"]
    assert sample["activeMediaIds"] == ["bg.png", "fg.png", "pip.png", "watermark.png"]

    layers = {layer["kind"]: layer for layer in sample["layers"]}
    assert layers["bg"]["bbox"] == {"x": 0.0, "y": 0.0, "width": 1280.0, "height": 720.0}
    assert layers["fg"]["sourceTime"] == pytest.approx(1.4)
    assert layers["pip"]["bbox"] == {
        "x": 499.2,
        "y": 115.84,
        "width": 281.6,
        "height": 140.8,
    }
    assert layers["pip"]["opacity"] == pytest.approx(0.7)
    assert layers["subtitle"]["lines"] == ["One subtitle."]
    assert layers["subtitle"]["style"]["fontSize"] == 21.0
    assert layers["watermark"]["bbox"] == {
        "x": 1177.6,
        "y": 0.0,
        "width": 102.4,
        "height": 51.2,
    }


def test_render_manifest_reports_transition_state_at_sampled_timestamp(tmp_path: Path) -> None:
    project = _project()
    fg_layer = project.layers[1].root
    fg_layer.items[0].transitions.in_ = "slide_right"

    manifest = build_render_manifest(
        project_dir=tmp_path,
        project=project,
        alignment=_alignment(),
        resolution="1280x720",
        timestamps=[1.2],
    )

    sample = manifest["samples"][0]
    fg_layer_manifest = next(layer for layer in sample["layers"] if layer["kind"] == "fg")
    assert fg_layer_manifest["transition"] == {
        "duration": 0.4,
        "kind": "slide_right",
        "phase": "in",
        "progress": 0.5,
        "translateX": -50.0,
    }


def test_render_manifest_joins_cjk_wrapped_subtitle_lines_without_inserted_space(
    tmp_path: Path,
) -> None:
    text = "\u4e00" * 21
    manifest = build_render_manifest(
        project_dir=tmp_path,
        project=_project(),
        alignment=AlignmentResult(
            sentences=[
                AlignedSentence(
                    index=1,
                    text=text,
                    start_s=0.0,
                    end_s=4.0,
                    confidence_avg=0.95,
                )
            ],
            words=[
                AlignedWord(
                    sentence_index=1,
                    text=text,
                    start_s=0.0,
                    end_s=4.0,
                    confidence=0.9,
                )
            ],
            cache_hit=True,
        ),
        resolution="1280x720",
        timestamps=[1.0],
        max_line_chars=40,
    )

    sample = manifest["samples"][0]
    subtitle = next(layer for layer in sample["layers"] if layer["kind"] == "subtitle")
    assert subtitle["lines"] == ["\u4e00" * 20, "\u4e00"]
    assert subtitle["text"] == text
