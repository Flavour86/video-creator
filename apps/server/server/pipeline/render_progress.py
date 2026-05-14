"""In-memory render progress fan-out."""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Literal, cast

from pydantic import BaseModel

from server.db.renders import add_render_event, get_latest_render_event

RenderStage = Literal["cache_warm", "compose", "muxing", "done", "error", "cancelled"]


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


class RenderLogEvent(BaseModel):
    type: Literal["log"] = "log"
    render_id: str
    line: str


RenderEvent = RenderProgressEvent | RenderLogEvent

_latest: dict[str, RenderProgressEvent] = {}
_subscribers: dict[tuple[str, str], set[asyncio.Queue[RenderEvent]]] = {}


async def publish_progress(event: RenderProgressEvent) -> None:
    _latest[event.render_id] = event
    add_render_event(
        render_id=event.render_id,
        phase=event.stage,
        progress=event.percent,
        message=event.message,
        detail_json={
            "eta_seconds": event.eta_seconds,
            "current_frame": event.current_frame,
            "speed": event.speed,
            "output_path": event.output_path,
        },
    )
    for queue in list(_subscribers_for_render(event.render_id)):
        queue.put_nowait(event)


async def publish_log(event: RenderLogEvent) -> None:
    for queue in list(_subscribers_for_render(event.render_id)):
        queue.put_nowait(event)


async def subscribe_progress(render_id: str, *, project_id: str) -> AsyncIterator[RenderEvent]:
    queue: asyncio.Queue[RenderEvent] = asyncio.Queue()
    latest = _latest.get(render_id)
    if latest is None:
        latest = _event_from_db(render_id)
    if latest is not None:
        queue.put_nowait(latest)
    key = (project_id, render_id)
    _subscribers.setdefault(key, set()).add(queue)
    try:
        while True:
            yield await queue.get()
    finally:
        subscribers = _subscribers.get(key)
        if subscribers is not None:
            subscribers.discard(queue)
            if not subscribers:
                _subscribers.pop(key, None)


def _subscribers_for_render(render_id: str) -> set[asyncio.Queue[RenderEvent]]:
    queues: set[asyncio.Queue[RenderEvent]] = set()
    for (subscribed_project_id, subscribed_render_id), subscribers in _subscribers.items():
        if subscribed_render_id != render_id:
            continue
        if not subscribers:
            continue
        if subscribed_project_id:
            queues.update(subscribers)
    return queues


def _event_from_db(render_id: str) -> RenderProgressEvent | None:
    row = get_latest_render_event(render_id)
    if row is None:
        return None
    detail = _parse_detail(row.get("detail_json"))
    phase = str(row.get("phase") or "compose")
    if phase not in {"cache_warm", "compose", "muxing", "done", "error", "cancelled"}:
        phase = "compose"
    progress = row.get("progress")
    eta_seconds = detail.get("eta_seconds")
    current_frame = detail.get("current_frame")
    return RenderProgressEvent(
        render_id=render_id,
        stage=cast(RenderStage, phase),
        percent=float(progress) if isinstance(progress, (int, float)) else 0.0,
        eta_seconds=eta_seconds if isinstance(eta_seconds, int) else None,
        current_frame=current_frame if isinstance(current_frame, int) else None,
        speed=str(detail["speed"]) if detail.get("speed") is not None else None,
        message=str(row["message"]) if row.get("message") is not None else None,
        output_path=str(detail["output_path"]) if detail.get("output_path") is not None else None,
    )


def _parse_detail(raw_detail: object) -> dict[str, object]:
    if not isinstance(raw_detail, str) or not raw_detail:
        return {}
    try:
        parsed = json.loads(raw_detail)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}
