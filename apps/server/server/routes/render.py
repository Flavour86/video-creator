"""Render endpoints."""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.pipeline import render as render_pipeline
from server.pipeline.filtergraph import RenderPreset
from server.pipeline.render import RenderError

router = APIRouter(tags=["render"])

class RenderRequest(BaseModel):
    preset: RenderPreset


class RenderResponse(BaseModel):
    render_id: str
    output_path: str


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
