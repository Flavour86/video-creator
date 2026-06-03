"""Project file load/save with validation."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

_REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(_REPO / "packages" / "shared-schemas" / "py"))
from schemas import (  # type: ignore[import-not-found]  # noqa: E402
    AlignmentState,
    CudaStatus,
    DetectedInputs,
    Project,
    ProjectConfigLoadResponse,
    ProjectConfigSaveResponse,
    ProjectStatus,
    RecentProject,
    RecentProjectCard,
    RecentProjectsPage,
    RuntimeHealthResponse,
    VersionedRuntimeStatus,
    WhisperXStatus,
)

__all__ = [
    "AlignmentState",
    "CudaStatus",
    "DetectedInputs",
    "Project",
    "ProjectConfigLoadResponse",
    "ProjectConfigSaveResponse",
    "ProjectStatus",
    "RecentProject",
    "RecentProjectCard",
    "RecentProjectsPage",
    "RuntimeHealthResponse",
    "VersionedRuntimeStatus",
    "WhisperXStatus",
    "load_project",
    "normalize_project_config",
]


SUBTITLE_STYLE_DEFAULTS: dict[str, object] = {
    "color": "#ffffff",
    "bg_color": "#000000",
    "bg_opacity": 62,
    "bg_radius": 8,
}


def normalize_project_config(data: dict[str, Any]) -> dict[str, Any]:
    """Backfill schema defaults for legacy project configs before validation."""
    subtitles = data.get("subtitles")
    if not isinstance(subtitles, dict):
        return data
    style = subtitles.get("style")
    if not isinstance(style, dict):
        return data
    if all(key in style for key in SUBTITLE_STYLE_DEFAULTS):
        return data

    normalized = dict(data)
    normalized_subtitles = dict(subtitles)
    normalized_subtitles["style"] = {**SUBTITLE_STYLE_DEFAULTS, **style}
    normalized["subtitles"] = normalized_subtitles
    return normalized


def load_project(project_dir: Path) -> Project:
    project_json = project_dir / "project.json"
    if not project_json.exists():
        raise FileNotFoundError(f"project.json not found in {project_dir}")
    data: dict[str, Any] = json.loads(project_json.read_text(encoding="utf-8"))
    return Project.model_validate(normalize_project_config(data))


def ensure_project_layout(project_dir: Path) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    for dir_name in ("media", "renders"):
        (project_dir / dir_name).mkdir(exist_ok=True)

    vc_dir = project_dir / ".vc"
    vc_dir.mkdir(exist_ok=True)
    for dir_name in ("clips", "drafts", "thumbs", "logs"):
        (vc_dir / dir_name).mkdir(exist_ok=True)

    transcript_path = project_dir / "transcript.txt"
    if not transcript_path.exists():
        transcript_path.write_text("", encoding="utf-8")

    subtitles_path = project_dir / "subtitles.srt"
    if not subtitles_path.exists():
        subtitles_path.write_text("", encoding="utf-8")

    has_voice_file = any(
        (project_dir / name).is_file()
        for name in ("voice.wav", "voice.mp3", "voice.m4a", "voice.flac", "voice.ogg")
    )
    if not has_voice_file:
        (project_dir / "voice.wav").write_bytes(b"")

    alignment_path = vc_dir / "alignment.json"
    if not alignment_path.exists():
        alignment_path.write_text(
            json.dumps({"sentences": [], "words": [], "cache_hit": False}),
            encoding="utf-8",
        )
