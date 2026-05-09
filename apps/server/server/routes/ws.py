"""WebSocket routes."""
from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket

from server.pipeline.render_progress import subscribe_progress

router = APIRouter(tags=["websocket"])


@router.websocket("/projects/render/ws")
async def render_progress_ws(websocket: WebSocket, render_id: str = Query(...)) -> None:
    await _render_events(websocket, render_id)


@router.websocket("/ws")
async def render_events_ws(websocket: WebSocket, render_id: str = Query(...)) -> None:
    await _render_events(websocket, render_id)


async def _render_events(websocket: WebSocket, render_id: str) -> None:
    await websocket.accept()
    async for event in subscribe_progress(render_id):
        await websocket.send_json(event.model_dump(mode="json", exclude_none=True))
        if event.type == "progress" and event.stage in {"done", "error", "cancelled"}:
            break
