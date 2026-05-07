from pathlib import Path

import pytest
from pydantic import ValidationError

from server.domain.project import Project, load_project, save_project


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
    save_project(tmp_path, project)
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
    save_project(tmp_path, project)
    loaded = load_project(tmp_path)
    assert len(loaded.layers) == 2
    assert loaded.layers[0].root.kind == "sub"
    assert loaded.layers[1].root.kind == "fg"
    assert loaded.layers[1].root.items[0].media_id == "img.jpg"


def test_invalid_version_rejected() -> None:
    with pytest.raises(ValidationError):
        Project.model_validate({"version": 2, "name": "x"})
