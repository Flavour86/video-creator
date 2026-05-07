"""In-memory render progress fan-out."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Literal

from pydantic import BaseModel

RenderStage = Literal["cache_warm", "compose", "muxing", "done", "error"]


class RenderProgressEvent(BaseModel):
    type: Literal["progress"] = "progress"
    render_id: str
    stage: RenderStage
    percent: float
    eta_seconds: int | None = None
    current_frame: int | None = None
    speed: str | None = None
    message: str | None = None
    output_path: str | None = None


_latest: dict[str, RenderProgressEvent] = {}
_subscribers: dict[str, set[asyncio.Queue[RenderProgressEvent]]] = {}


async def publish_progress(event: RenderProgressEvent) -> None:
    _latest[event.render_id] = event
    for queue in list(_subscribers.get(event.render_id, set())):
        queue.put_nowait(event)


async def subscribe_progress(render_id: str) -> AsyncIterator[RenderProgressEvent]:
    queue: asyncio.Queue[RenderProgressEvent] = asyncio.Queue()
    latest = _latest.get(render_id)
    if latest is not None:
        queue.put_nowait(latest)
    _subscribers.setdefault(render_id, set()).add(queue)
    try:
        while True:
            yield await queue.get()
    finally:
        subscribers = _subscribers.get(render_id)
        if subscribers is not None:
            subscribers.discard(queue)
            if not subscribers:
                _subscribers.pop(render_id, None)
