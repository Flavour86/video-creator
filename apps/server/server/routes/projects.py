from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from server.db.projects import list_recent, remove_recent, touch_recent
from server.domain.project import Project, load_project

router = APIRouter(prefix="/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    path: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)


class ProjectResponse(BaseModel):
    path: str
    name: str


class RecentProject(BaseModel):
    path: str
    name: str
    last_opened_at: str
    voice_duration: str = ""
    sentence_count: int = 0
    media_count: int = 0


class OpenProjectRequest(BaseModel):
    path: str = Field(min_length=1)


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def _project_metadata(project_dir: Path, name: str, last_opened_at: str = "") -> RecentProject:
    media_dir = project_dir / "media"
    media_count = (
        len([entry for entry in media_dir.iterdir() if entry.is_file()])
        if media_dir.exists()
        else 0
    )
    return RecentProject(
        path=str(project_dir),
        name=name,
        last_opened_at=last_opened_at,
        media_count=media_count,
    )


@router.post("", response_model=ProjectResponse)
async def create_project(payload: CreateProjectRequest) -> ProjectResponse | JSONResponse:
    project_dir = Path(payload.path)
    if not project_dir.is_absolute() or not project_dir.parent.exists():
        return _error(
            400,
            "INVALID_PATH",
            "Project path must be absolute and its parent directory must exist.",
            {"path": payload.path},
        )

    if project_dir.exists() and any(project_dir.iterdir()):
        return _error(
            409,
            "NOT_EMPTY",
            "Project directory already exists and is not empty.",
            {"path": payload.path},
        )

    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "media").mkdir(exist_ok=True)
    (project_dir / "renders").mkdir(exist_ok=True)
    (project_dir / ".vc").mkdir(exist_ok=True)

    now = datetime.now(UTC).isoformat()
    project = Project.model_validate(
        {
            "version": 1,
            "name": payload.name,
            "created_at": now,
            "updated_at": now,
            "audio": "",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [],
            "subtitles": None,
            "watermark": None,
        }
    )
    (project_dir / "project.json").write_text(
        json.dumps(project.model_dump(mode="json", by_alias=True, exclude_none=False), indent=2),
        encoding="utf-8",
    )
    touch_recent(project_dir, payload.name)
    return ProjectResponse(path=str(project_dir), name=payload.name)


@router.get("/recent", response_model=list[RecentProject])
async def recent_projects() -> list[RecentProject]:
    rows = list_recent()
    return [
        _project_metadata(Path(row["path"]), row["name"], row["last_opened_at"])
        for row in rows
    ]


@router.post("/open", response_model=RecentProject)
async def open_project(payload: OpenProjectRequest) -> RecentProject | JSONResponse:
    project_dir = Path(payload.path)
    project_json = project_dir / "project.json"
    if not project_json.exists():
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project folder is missing or does not contain project.json.",
            {"path": payload.path},
        )
    project = load_project(project_dir)
    touch_recent(project_dir, project.name)
    return _project_metadata(project_dir, project.name)


@router.delete("/recent")
async def delete_recent_project(payload: OpenProjectRequest) -> dict[str, bool]:
    remove_recent(Path(payload.path))
    return {"ok": True}
