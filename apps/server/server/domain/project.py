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
    Project,
    RecentProject,
    RuntimeHealthResponse,
    VersionedRuntimeStatus,
    WhisperXStatus,
)

__all__ = [
    "AlignmentState",
    "CudaStatus",
    "Project",
    "RecentProject",
    "RuntimeHealthResponse",
    "VersionedRuntimeStatus",
    "WhisperXStatus",
    "load_project",
    "save_project",
]


def load_project(project_dir: Path) -> Project:
    project_json = project_dir / "project.json"
    if not project_json.exists():
        raise FileNotFoundError(f"project.json not found in {project_dir}")
    data: dict[str, Any] = json.loads(project_json.read_text(encoding="utf-8"))
    return Project.model_validate(data)


def save_project(project_dir: Path, project: Project) -> None:
    project_json = project_dir / "project.json"
    project_dir.mkdir(parents=True, exist_ok=True)
    project_json.write_text(
        json.dumps(project.model_dump(mode="json", by_alias=True, exclude_none=False), indent=2),
        encoding="utf-8",
    )
