"""Render endpoints."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.db.renders import get_render_for_project, list_renders_for_project
from server.pipeline import render as render_pipeline
from server.pipeline.filtergraph import RenderPreset
from server.pipeline.render import RenderError

router = APIRouter(tags=["render"])

class RenderRequest(BaseModel):
    preset: RenderPreset


class RenderResponse(BaseModel):
    render_id: str
    output_path: str


class RenderHistoryResponse(BaseModel):
    id: str
    output_path: str
    preset: str
    started_at: str
    finished_at: str | None
    duration_s: float | None
    status: str
    message: str | None
    file_size: int


def _error(status_code: int, code: str, message: str, details: dict[str, str]) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}},
    )


@router.post("/projects/render", response_model=RenderResponse)
async def render_project(
    payload: RenderRequest,
    project: str = Query(...),
) -> RenderResponse | JSONResponse:
    project_dir = Path(project)
    if not (project_dir / "project.json").exists():
        return _error(404, "PROJECT_NOT_FOUND", "Project not found.", {"project": project})

    try:
        result = await render_pipeline.start_render_project(
            project_dir=project_dir,
            preset=payload.preset,
        )
    except RenderError as exc:
        return _error(exc.status_code, exc.code, exc.message, {"project": project})

    return RenderResponse(render_id=result.render_id, output_path=str(result.output_path))


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

    output_path = Path(str(row["output_path"]))
    if not output_path.is_file():
        return _error(
            404,
            "OUTPUT_NOT_FOUND",
            "Render output not found.",
            {"path": str(output_path)},
        )

    render_pipeline.reveal_in_file_browser(output_path)
    return {"ok": True}


def _render_history_response(row: dict[str, str | float | None]) -> RenderHistoryResponse:
    output_path = Path(str(row["output_path"]))
    return RenderHistoryResponse(
        id=str(row["id"]),
        output_path=str(output_path),
        preset=str(row["preset"]),
        started_at=str(row["started_at"]),
        finished_at=str(row["finished_at"]) if row["finished_at"] is not None else None,
        duration_s=float(row["duration_s"]) if row["duration_s"] is not None else None,
        status=str(row["status"]),
        message=str(row["message"]) if row["message"] is not None else None,
        file_size=output_path.stat().st_size if output_path.is_file() else 0,
    )
