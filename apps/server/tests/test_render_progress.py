from __future__ import annotations

import asyncio

import pytest

from server.pipeline.render_progress import (
    RenderProgressEvent,
    publish_progress,
    subscribe_progress,
)


@pytest.mark.asyncio
async def test_subscriber_receives_published_progress_event() -> None:
    render_id = "r-progress"
    events = subscribe_progress(render_id)
    next_event = asyncio.create_task(events.__anext__())

    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="compose",
            percent=42.0,
            eta_seconds=12,
            current_frame=120,
            speed="1.2x",
            message=None,
        )
    )

    event = await next_event
    await events.aclose()
    assert event.render_id == render_id
    assert event.stage == "compose"
    assert event.percent == 42.0


@pytest.mark.asyncio
async def test_late_subscriber_receives_latest_event() -> None:
    render_id = "r-late"
    await publish_progress(
        RenderProgressEvent(
            render_id=render_id,
            stage="cache_warm",
            percent=5.0,
        )
    )

    events = subscribe_progress(render_id)
    event = await events.__anext__()
    await events.aclose()
    assert event.stage == "cache_warm"
    assert event.percent == 5.0
