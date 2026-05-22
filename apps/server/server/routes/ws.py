"""WebSocket routes."""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketException, status

from server.db.renders import get_render_project_id, render_belongs_to_project
from server.pipeline.render_progress import subscribe_progress

router = APIRouter(tags=["websocket"])


@router.websocket("/projects/render/ws")
async def render_progress_ws(websocket: WebSocket, render_id: str = Query(...)) -> None:
    project_id = get_render_project_id(render_id)
    if project_id is None:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    await _render_events(websocket, render_id, project_id)


@router.websocket("/ws")
async def render_events_ws(
    websocket: WebSocket,
    render_id: str = Query(...),
    project_id: str = Query(..., min_length=1),
) -> None:
    if not render_belongs_to_project(render_id=render_id, project_id=project_id):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    await _render_events(websocket, render_id, project_id)


async def _render_events(websocket: WebSocket, render_id: str, project_id: str) -> None:
    await websocket.accept()
    async for event in subscribe_progress(render_id, project_id=project_id):
        await websocket.send_json(event.model_dump(mode="json", exclude_none=True))
        if event.type == "progress" and event.stage in {"done", "failed", "error", "cancelled"}:
            break
