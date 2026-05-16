"""Render endpoints."""
from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from server.db.projects import project_path_for_id
from server.db.renders import (
    delete_render,
    delete_renders,
    get_render,
    get_render_for_project,
    list_renders_for_project,
)
from server.db.renders import (
    list_renders as list_all_renders,
)
from server.pipeline import render as render_pipeline
from server.pipeline.filtergraph import RenderPreset
from server.pipeline.render import RenderError

router = APIRouter(tags=["render"])


RenderResolution = Literal["1920x1080", "1280x720", "1080x1920"]


class RenderRequest(BaseModel):
    preset: RenderPreset
    resolution: RenderResolution | None = None


class RenderResponse(BaseModel):
    render_id: str
    output_path: str


class RenderHistoryResponse(BaseModel):
    id: str
    output_path: str
    output_exists: bool
    preset: str
    started_at: str
    finished_at: str | None
    duration_s: float | None
    status: str
    message: str | None
    file_size: int | None


class RenderCancelRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    job_id: str | None = Field(default=None, alias="jobId")
    render_id: str | None = None


class SystemPathRequest(BaseModel):
    path: str


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


def _project_path_or_error(project_id: str) -> Path | JSONResponse:
    project_dir = project_path_for_id(project_id)
    if project_dir is None or not project_dir.is_dir():
        return _error(
            404,
            "PROJECT_NOT_FOUND",
            "Project not found.",
            {"project_id": project_id},
        )
    return project_dir


@router.post("/projects/render", response_model=RenderResponse)
async def render_project(
    payload: RenderRequest | None = None,
    project: str = Query(...),
    preset: RenderPreset | None = Query(default=None),
    resolution: RenderResolution | None = Query(default=None),
) -> RenderResponse | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    resolved_preset = preset or (payload.preset if payload is not None else None)
    if resolved_preset is None:
        return _error(422, "RENDER_PRESET_REQUIRED", "Render preset is required.", {})
    resolved_resolution = resolution or (payload.resolution if payload is not None else None)

    try:
        result = await render_pipeline.start_render_project(
            project_dir=project_dir,
            preset=resolved_preset,
            resolution=resolved_resolution,
        )
    except RenderError as exc:
        return _error(exc.status_code, exc.code, exc.message, {"project": project})

    return RenderResponse(render_id=result.render_id, output_path=str(result.output_path))


@router.post("/projects/{project_id}/render", response_model=RenderResponse)
async def render_project_by_id(
    project_id: str,
    payload: RenderRequest | None = None,
    preset: RenderPreset | None = Query(default=None),
    resolution: RenderResolution | None = Query(default=None),
) -> RenderResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await render_project(
        payload=payload,
        project=str(project_dir),
        preset=preset,
        resolution=resolution,
    )


@router.get("/render/job/{render_id}", response_model=RenderHistoryResponse)
async def get_render_job(render_id: str) -> RenderHistoryResponse | JSONResponse:
    row = get_render(render_id)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    return _render_history_response(row)


@router.post("/render/cancel", response_model=None)
async def cancel_render_job(payload: RenderCancelRequest) -> dict[str, bool] | JSONResponse:
    render_id = payload.job_id or payload.render_id
    if not render_id:
        return _error(422, "RENDER_ID_REQUIRED", "Render id is required.", {})
    canceled = await render_pipeline.cancel_render(render_id)
    if not canceled:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    return {"ok": True}


@router.get("/render/history", response_model=list[RenderHistoryResponse])
async def list_render_history(
    include: str = Query("all"),
    limit: int = Query(50, ge=1, le=500),
) -> list[RenderHistoryResponse]:
    rows = list_all_renders(limit=limit, include_excluded=include == "excluded" or include == "all")
    return [_render_history_response(row) for row in rows]


@router.delete("/render/history/{render_id}", response_model=None)
async def delete_render_history(render_id: str) -> dict[str, bool] | JSONResponse:
    row = delete_render(render_id)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    _delete_output_file(_resolve_stored_path(str(row["output_path"])))
    return {"ok": True}


@router.delete("/render/history", response_model=None)
async def purge_render_history() -> dict[str, bool]:
    for row in delete_renders():
        _delete_output_file(_resolve_stored_path(str(row["output_path"])))
    return {"ok": True}


@router.post("/system/reveal", response_model=None)
async def reveal_path(payload: SystemPathRequest) -> dict[str, bool] | JSONResponse:
    try:
        path = _safe_workspace_path(payload.path)
    except ValueError:
        return _error(
            403,
            "PATH_NOT_ALLOWED",
            "Path is outside the workspace.",
            {"path": payload.path},
        )
    if not path.exists():
        return _error(404, "PATH_NOT_FOUND", "Path not found.", {"path": str(path)})
    render_pipeline.reveal_in_file_browser(path)
    return {"ok": True}


@router.post("/system/open", response_model=None)
async def open_path(payload: SystemPathRequest) -> dict[str, bool] | JSONResponse:
    try:
        path = _safe_workspace_path(payload.path)
    except ValueError:
        return _error(
            403,
            "PATH_NOT_ALLOWED",
            "Path is outside the workspace.",
            {"path": payload.path},
        )
    if not path.is_file():
        return _error(404, "PATH_NOT_FOUND", "File not found.", {"path": str(path)})
    render_pipeline.open_in_default_player(path)
    return {"ok": True}


@router.get("/projects/renders", response_model=list[RenderHistoryResponse])
async def list_renders(
    project: str = Query(...),
    limit: int = Query(10, ge=1, le=500),
) -> list[RenderHistoryResponse] | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    rows = list_renders_for_project(project_dir, limit=limit)
    return [_render_history_response(row) for row in rows]


@router.get("/projects/{project_id}/renders", response_model=list[RenderHistoryResponse])
async def list_project_renders(
    project_id: str,
    limit: int = Query(10, ge=1, le=500),
) -> list[RenderHistoryResponse] | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await list_renders(project=str(project_dir), limit=limit)


@router.get("/projects/{project_id}/renders/{render_id}", response_model=RenderHistoryResponse)
async def get_project_render(
    project_id: str,
    render_id: str,
) -> RenderHistoryResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    row = get_render_for_project(render_id, project_dir)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    return _render_history_response(row)


@router.delete("/projects/render/{render_id}", response_model=None)
async def cancel_render(
    render_id: str,
    project: str = Query(...),
) -> dict[str, bool] | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})
    canceled = await render_pipeline.cancel_render(render_id)
    if not canceled:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    return {"ok": True}


@router.delete("/projects/{project_id}/renders/{render_id}", response_model=None)
async def delete_project_render(
    project_id: str,
    render_id: str,
) -> dict[str, bool] | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    row = get_render_for_project(render_id, project_dir)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    delete_render(render_id)
    return {"ok": True}


@router.post("/projects/{project_id}/renders/{render_id}/cancel", response_model=None)
async def cancel_project_render(
    project_id: str,
    render_id: str,
) -> dict[str, bool] | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await cancel_render(render_id=render_id, project=str(project_dir))


@router.post("/projects/renders/{render_id}/reveal", response_model=None)
async def reveal_render(
    render_id: str,
    project: str = Query(...),
) -> dict[str, bool] | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    row = get_render_for_project(render_id, project_dir)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})

    output_path = _resolve_stored_path(str(row["output_path"]))
    if not output_path.is_file():
        return _error(
            404,
            "OUTPUT_NOT_FOUND",
            "Render output not found.",
            {"path": str(output_path)},
        )

    render_pipeline.reveal_in_file_browser(output_path)
    return {"ok": True}


@router.post("/projects/{project_id}/renders/{render_id}/reveal", response_model=None)
async def reveal_project_render(
    project_id: str,
    render_id: str,
) -> dict[str, bool] | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await reveal_render(render_id=render_id, project=str(project_dir))


@router.post("/projects/renders/{render_id}/play", response_model=None)
async def play_render(
    render_id: str,
    project: str = Query(...),
) -> dict[str, bool] | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    row = get_render_for_project(render_id, project_dir)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    if row["status"] != "rendered":
        return _error(
            409,
            "RENDER_NOT_PLAYABLE",
            "Render is not playable.",
            {"render_id": render_id},
        )

    output_path = _resolve_stored_path(str(row["output_path"]))
    if not output_path.is_file():
        return _error(
            404,
            "OUTPUT_NOT_FOUND",
            "Render output not found.",
            {"path": str(output_path)},
        )

    render_pipeline.open_in_default_player(output_path)
    return {"ok": True}


@router.post("/projects/{project_id}/renders/{render_id}/play", response_model=None)
async def play_project_render(
    project_id: str,
    render_id: str,
) -> dict[str, bool] | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    return await play_render(render_id=render_id, project=str(project_dir))


@router.get("/projects/{project_id}/renders/{render_id}/file", response_model=None)
async def get_project_render_file(project_id: str, render_id: str) -> FileResponse | JSONResponse:
    project_dir = _project_path_or_error(project_id)
    if isinstance(project_dir, JSONResponse):
        return project_dir
    row = get_render_for_project(render_id, project_dir)
    if row is None:
        return _error(404, "RENDER_NOT_FOUND", "Render not found.", {"render_id": render_id})
    if row["status"] != "rendered":
        return _error(
            409,
            "RENDER_NOT_PLAYABLE",
            "Render is not playable.",
            {"render_id": render_id},
        )
    output_path = _resolve_stored_path(str(row["output_path"]))
    if not output_path.is_file():
        return _error(
            404,
            "OUTPUT_NOT_FOUND",
            "Render output not found.",
            {"path": str(output_path)},
        )
    return FileResponse(str(output_path), media_type="video/mp4")


def _render_history_response(row: Mapping[str, object]) -> RenderHistoryResponse:
    output_path = _resolve_stored_path(str(row["output_path"]))
    output_exists = output_path.is_file()
    duration = row["duration_s"]
    return RenderHistoryResponse(
        id=str(row["id"]),
        output_path=str(output_path),
        output_exists=output_exists,
        preset=str(row["preset"]),
        started_at=str(row["started_at"]),
        finished_at=str(row["finished_at"]) if row["finished_at"] is not None else None,
        duration_s=float(duration) if isinstance(duration, int | float | str) else None,
        status=str(row["status"]),
        message=str(row["message"]) if row["message"] is not None else None,
        file_size=output_path.stat().st_size if output_exists else None,
    )


def _workspace_root() -> Path:
    cwd = Path.cwd().resolve()
    if cwd.name == "server" and cwd.parent.name == "apps":
        return cwd.parent.parent
    return cwd


def _resolve_stored_path(raw_path: str) -> Path:
    path = Path(raw_path)
    if path.is_absolute():
        return path
    return _workspace_root() / path


def _safe_workspace_path(raw_path: str) -> Path:
    path = _resolve_stored_path(raw_path).resolve()
    root = _workspace_root()
    if path != root and root not in path.parents:
        raise ValueError(raw_path)
    return path


def _delete_output_file(path: Path) -> None:
    try:
        safe_path = _safe_workspace_path(str(path))
    except ValueError:
        return
    if safe_path.is_file():
        safe_path.unlink()
