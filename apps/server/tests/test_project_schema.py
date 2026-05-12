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


def test_minimal_valid(tmp_path: Path) -> None:
    project = Project.model_validate(
        {
            "version": 1,
            "name": "test",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
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
            "output": {"preset": "draft"},
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
                            "motion": {"kind": "ken_burns", "easing": "ease_in_out"},
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
    assert loaded.layers[1].root.items[0].media_id == "img.jpg"


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
            "output": {"preset": "final"},
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
                            "mediaId": "media-bg-1",
                            "mediaIds": ["media-bg-1"],
                            "sentences": [1, 2],
                            "start": 0,
                            "end": 10,
                            "motion": {"kind": "ken_burns", "easing": "ease_in_out"},
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
    assert project.layers[0].root.items[0].media_ids == ["media-bg-1"]
    assert project.layers[0].root.items[0].cache_status.value == "warm"


def test_invalid_version_rejected() -> None:
    with pytest.raises(ValidationError):
        Project.model_validate({"version": 2, "name": "x"})
