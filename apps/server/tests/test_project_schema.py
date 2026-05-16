import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from server.domain.project import Project, load_project


def _dump_project(project_dir: Path, project: Project) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "project.json").write_text(
        json.dumps(
            project.model_dump(mode="json", by_alias=True, exclude_none=False), indent=2
        ),
        encoding="utf-8",
    )


def _phase1_output() -> dict[str, object]:
    return {
        "preset": "draft",
        "resolution": "1080p",
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "video_codec": "h264",
        "video_crf": 23,
        "video_preset": "medium",
        "audio_codec": "aac",
        "audio_bitrate_kbps": 192,
        "audio_sample_rate": 48000,
        "pixel_format": "yuv420p",
        "color_space": "bt709",
    }


def _item_root(item: object) -> object:
    return getattr(item, "root", item)


def test_minimal_valid(tmp_path: Path) -> None:
    project = Project.model_validate(
        {
            "version": 1,
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": _phase1_output(),
            "layers": [],
        }
    )
    _dump_project(tmp_path, project)
    loaded = load_project(tmp_path)
    assert loaded.name == "test"
    assert loaded.layers == []


def test_fg_layer_round_trip(tmp_path: Path) -> None:
    project = Project.model_validate(
        {
            "version": 1,
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": _phase1_output(),
            "layers": [
                {
                    "id": "L-sub",
                    "kind": "sub",
                    "name": "Subtitles",
                    "items": [
                        {
                            "id": "sub-all",
                            "auto": True,
                            "label": "auto from transcript - 0 cues",
                            "style": "default",
                        }
                    ],
                },
                {
                    "id": "L-fg-1",
                    "kind": "fg",
                    "name": "Foreground z1",
                    "items": [
                        {
                            "id": "fg-001",
                            "mediaId": "img.jpg",
                            "sentences": [1, 3],
                            "start": 0.3,
                            "end": 19.5,
                            "motion": {"kind": "ken_burns", "easing": "ease_in"},
                            "transitions": {"in": "fade", "out": "cut"},
                        }
                    ],
                },
            ],
        }
    )
    _dump_project(tmp_path, project)
    loaded = load_project(tmp_path)
    assert len(loaded.layers) == 2
    assert loaded.layers[0].root.kind == "sub"
    assert loaded.layers[1].root.kind == "fg"
    assert _item_root(loaded.layers[1].root.items[0]).media_id == "img.jpg"


def test_spec_media_playlist_cache_and_hash_fields_validate() -> None:
    project = Project.model_validate(
        {
            "version": 1,
            "project_id": "p-demo",
            "config_hash": "sha256:current",
            "last_rendered_config_hash": "sha256:rendered",
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {**_phase1_output(), "preset": "final"},
            "media": [
                {
                    "id": "media-bg-1",
                    "name": "bg.jpg",
                    "kind": "image",
                    "path": "media/bg.jpg",
                    "thumb_path": ".vc/thumbs/bg.jpg",
                    "dimensions": {"width": 1920, "height": 1080},
                    "duration": None,
                    "size": 1234,
                    "hash": "sha256:bg",
                    "import_mode": "copy",
                    "imported_at": "2026-05-09T00:00:00Z",
                }
            ],
            "layers": [
                {
                    "id": "L-bg",
                    "kind": "bg",
                    "name": "Background",
                    "items": [
                        {
                            "id": "bg-playlist",
                            "mediaIds": ["media-bg-1"],
                            "sentences": [1, 2],
                            "start": 0,
                            "end": 10,
                            "motion": {"kind": "ken_burns", "easing": "ease_in"},
                            "transitions": {"in": "cut", "out": "fade"},
                            "crossfade": 0.4,
                            "cache_status": "warm",
                            "orphaned": False,
                            "orphan_reason": None,
                        }
                    ],
                }
            ],
        }
    )

    assert project.project_id == "p-demo"
    assert project.media[0].id == "media-bg-1"
    bg_item = _item_root(project.layers[0].root.items[0])
    assert bg_item.media_ids == ["media-bg-1"]
    assert bg_item.cache_status.value == "warm"


def test_editor_schema_accepts_task1_media_visual_subtitle_and_resolution_fields() -> None:
    project = Project.model_validate(
        {
            "version": 1,
            "name": "task1",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {**_phase1_output(), "resolution": "9:16"},
            "media": [
                {
                    "id": "media-v-1",
                    "name": "clip.mp4",
                    "kind": "video",
                    "path": "media/clip.mp4",
                    "thumb_path": ".vc/thumbs/clip.jpg",
                    "dimensions": {"width": 1080, "height": 1920},
                    "duration": 12.5,
                    "size": 54321,
                    "hash": "sha256:clip",
                    "import_mode": "copy",
                    "created_at": "2026-05-09T00:00:00Z",
                    "imported_at": "2026-05-09T00:00:01Z",
                }
            ],
            "layers": [
                {
                    "id": "L-bg",
                    "kind": "bg",
                    "name": "Background",
                    "items": [
                        {
                            "id": "bg-playlist",
                            "mediaIds": ["media-v-1"],
                            "sentences": [1, 2],
                            "start": 0,
                            "end": 12.5,
                            "motion": {"kind": "none", "easing": "linear"},
                            "transitions": {"in": "cut", "out": "fade"},
                            "crossfade": 0.2,
                            "cache_status": "partial",
                            "orphaned": False,
                            "orphan_reason": None,
                        }
                    ],
                },
                {
                    "id": "L-pip",
                    "kind": "pip",
                    "name": "PiP",
                    "items": [
                        {
                            "id": "pip-1",
                            "mediaId": "media-v-1",
                            "sentences": [2, 2],
                            "start": 2,
                            "end": 8,
                            "motion": {"kind": "none", "easing": "linear"},
                            "transitions": {"in": "fade", "out": "cut"},
                            "pip": {"posX": 50, "posY": 50, "size": 15, "radius": 32, "opacity": 10},
                        }
                    ],
                },
            ],
            "subtitles": {
                "burn_in": True,
                "style": {
                    "font": "Arial",
                    "size": 72,
                    "position": "bottom_low",
                    "max_chars_per_line": 80,
                    "bg_style": "pill",
                },
            },
        }
    )

    assert getattr(project.output.resolution, "value", project.output.resolution) == "9:16"
    assert project.media[0].created_at is not None
    assert _item_root(project.layers[0].root.items[0]).media_ids == ["media-v-1"]
    assert _item_root(project.layers[1].root.items[0]).pip.size == 15
    assert project.subtitles is not None
    assert project.subtitles.style.position.value == "bottom_low"
    assert project.subtitles.style.bg_style.value == "pill"


def test_editor_schema_rejects_out_of_range_pip_and_subtitle_values() -> None:
    payload = {
        "version": 1,
        "name": "invalid",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": _phase1_output(),
        "layers": [
            {
                "id": "L-pip",
                "kind": "pip",
                "name": "PiP",
                "items": [
                    {
                        "id": "pip-1",
                        "mediaId": "media.jpg",
                        "sentences": [1, 1],
                        "start": 0,
                        "end": 2,
                        "motion": {"kind": "none", "easing": "linear"},
                        "transitions": {"in": "cut", "out": "cut"},
                        "pip": {"posX": 50, "posY": 50, "size": 10, "radius": 33, "opacity": 9},
                    }
                ],
            }
        ],
        "subtitles": {
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 27,
                "position": "bottom_low",
                "max_chars_per_line": 19,
                "bg_style": "pill",
            },
        },
    }

    with pytest.raises(ValidationError):
        Project.model_validate(payload)


def test_editor_schema_declares_visual_media_reference_constraints() -> None:
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "packages" / "shared-schemas" / "project.schema.json").read_text(
            encoding="utf-8"
        )
    )
    defs = schema["$defs"]
    media_ref = defs["VisualMediaRefConstraint"]
    assert {"required": ["mediaId"]} in media_ref["anyOf"]
    assert {"required": ["mediaIds"]} in media_ref["anyOf"]
    assert media_ref["not"] == {"required": ["mediaId", "mediaIds"]}

    for item_name in ("ForegroundItem", "PipItem", "BackgroundItem"):
        all_of = defs[item_name]["allOf"]
        assert {"$ref": "#/$defs/VisualMediaRefConstraint"} in all_of


def test_visual_item_schema_requires_one_media_reference_mode() -> None:
    schema = json.loads(
        (Path(__file__).resolve().parents[3] / "packages" / "shared-schemas" / "project.schema.json").read_text(
            encoding="utf-8"
        )
    )
    visual_schema = schema["$defs"]["VisualMediaRefConstraint"]
    assert {"required": ["mediaId"]} in visual_schema["anyOf"]
    assert {"required": ["mediaIds"]} in visual_schema["anyOf"]
    assert visual_schema["not"] == {"required": ["mediaId", "mediaIds"]}


def test_editor_schema_rejects_legacy_subtitle_and_resolution_values() -> None:
    base = {
        "version": 1,
        "name": "legacy",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": _phase1_output(),
        "layers": [],
        "subtitles": {
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 42,
                "position": "bottom",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
    }

    invalid_resolution = {**base, "output": {**_phase1_output(), "resolution": "1920x1080"}}
    invalid_position = {
        **base,
        "subtitles": {
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 42,
                "position": "bottom-center",
                "max_chars_per_line": 42,
                "bg_style": "shadow",
            },
        },
    }
    invalid_bg_style = {
        **base,
        "subtitles": {
            "burn_in": True,
            "style": {
                "font": "Arial",
                "size": 42,
                "position": "bottom",
                "max_chars_per_line": 42,
                "bg_style": "box",
            },
        },
    }

    with pytest.raises(ValidationError):
        Project.model_validate(invalid_resolution)
    with pytest.raises(ValidationError):
        Project.model_validate(invalid_position)
    with pytest.raises(ValidationError):
        Project.model_validate(invalid_bg_style)


def test_invalid_version_rejected() -> None:
    with pytest.raises(ValidationError):
        Project.model_validate({"version": 2, "name": "x"})


def test_ai_field_rejected() -> None:
    payload = {
        "version": 1,
        "name": "test",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": _phase1_output(),
        "layers": [],
        "ai": {"provider": "future"},
    }
    with pytest.raises(ValidationError):
        Project.model_validate(payload)


def test_characters_field_rejected() -> None:
    payload = {
        "version": 1,
        "name": "test",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": _phase1_output(),
        "layers": [],
        "characters": [{"id": "c1"}],
    }
    with pytest.raises(ValidationError):
        Project.model_validate(payload)
