from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.db.projects import project_id_for_path, touch_recent
from server.db.renders import add_render_event, insert_render, mark_render_finished
from server.domain.project import load_project
from server.main import app
from server.pipeline import render as render_pipeline
from server.pipeline.clip_render import clip_cache_path_for_item
from server.pipeline.render import RenderError, RenderResult
from server.routes import projects as project_routes
from server.routes import render as render_routes
from server.settings import settings


def _write_project(project_dir: Path, project: dict[str, object] | None = None) -> None:
    project_dir.mkdir(exist_ok=True)
    payload = project or {
        "version": 1,
        "name": "test",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": {"preset": "draft"},
        "layers": [],
        "subtitles": None,
        "watermark": None,
    }
    (project_dir / "project.json").write_text(
        json.dumps(payload),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_render_endpoint_returns_render_result(monkeypatch, tmp_path: Path) -> None:
    _write_project(tmp_path)

    async def fake_start_render_project(
        *,
        project_dir: Path,
        preset: str,
        resolution: str | None = None,
    ) -> RenderResult:
        assert project_dir == tmp_path
        assert preset == "draft"
        assert resolution is None
        return RenderResult(
            render_id="r-test",
            output_path=tmp_path / ".vc" / "drafts" / "draft.mp4",
        )

    monkeypatch.setattr(render_pipeline, "start_render_project", fake_start_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path)},
            json={"preset": "draft"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "render_id": "r-test",
        "output_path": str(tmp_path / ".vc" / "drafts" / "draft.mp4"),
    }


@pytest.mark.asyncio
async def test_project_id_render_routes(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    touch_recent(tmp_path, "Render")
    project_id = project_id_for_path(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-by-id",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_finished(
        render_id="r-by-id",
        finished_at=datetime_now(),
        duration_s=1.5,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        rows = await client.get(f"/projects/{project_id}/renders")
        item = await client.get(f"/projects/{project_id}/renders/r-by-id")
        delete = await client.delete(f"/projects/{project_id}/renders/r-by-id")

    assert rows.status_code == 200
    assert rows.json()[0]["id"] == "r-by-id"
    assert item.status_code == 200
    assert item.json()["id"] == "r-by-id"
    assert delete.status_code == 200


@pytest.mark.asyncio
async def test_render_endpoint_accepts_query_preset_and_resolution(
    monkeypatch, tmp_path: Path
) -> None:
    _write_project(tmp_path)

    async def fake_start_render_project(
        *,
        project_dir: Path,
        preset: str,
        resolution: str | None = None,
    ) -> RenderResult:
        assert project_dir == tmp_path
        assert preset == "final"
        assert resolution == "1080x1920"
        return RenderResult(
            render_id="r-query",
            output_path=tmp_path / "renders" / "final.mp4",
        )

    monkeypatch.setattr(render_pipeline, "start_render_project", fake_start_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={
                "project": str(tmp_path),
                "preset": "final",
                "resolution": "1080x1920",
            },
        )

    assert response.status_code == 200
    assert response.json() == {
        "render_id": "r-query",
        "output_path": str(tmp_path / "renders" / "final.mp4"),
    }


@pytest.mark.asyncio
async def test_render_endpoint_rejects_editor_resolution_aliases(tmp_path: Path) -> None:
    _write_project(tmp_path)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={
                "project": str(tmp_path),
                "preset": "final",
                "resolution": "9:16",
            },
        )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_project_id_cancel_render_route(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    touch_recent(tmp_path, "Render")
    project_id = project_id_for_path(tmp_path)
    cancelled: list[str] = []

    async def fake_cancel_render(render_id: str) -> bool:
        cancelled.append(render_id)
        return True

    monkeypatch.setattr(render_pipeline, "cancel_render", fake_cancel_render)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/projects/{project_id}/renders/r-cancel/cancel")

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert cancelled == ["r-cancel"]


@pytest.mark.asyncio
async def test_render_endpoint_project_not_found(tmp_path: Path) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path / "missing")},
            json={"preset": "draft"},
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROJECT_NOT_FOUND"


@pytest.mark.asyncio
async def test_render_endpoint_rejects_in_progress_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _write_project(tmp_path)

    async def busy_start_render_project(
        *,
        project_dir: Path,
        preset: str,
        resolution: str | None = None,
    ) -> RenderResult:
        raise RenderError(409, "RENDER_IN_PROGRESS", "Render already running.")

    monkeypatch.setattr(render_pipeline, "start_render_project", busy_start_render_project)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/render",
            params={"project": str(tmp_path)},
            json={"preset": "draft"},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RENDER_IN_PROGRESS"


@pytest.mark.asyncio
async def test_list_renders_returns_history(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / ".vc" / "drafts" / "draft.mp4"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-history",
        project_path=tmp_path,
        output_path=output_path,
        preset="draft",
        started_at=datetime_now(),
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_finished(
        render_id="r-history",
        finished_at=datetime_now(),
        duration_s=1.5,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/renders", params={"project": str(tmp_path)})

    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["id"] == "r-history"
    assert rows[0]["file_size"] == 3
    assert rows[0]["artifacts"][0]["kind"] == "output"
    assert rows[0]["artifacts"][0]["path"].endswith("draft.mp4")
    assert rows[0]["events"] == []
    assert rows[0]["capabilities"]["reveal_in_explorer_supported"] in {True, False}


@pytest.mark.asyncio
async def test_list_renders_maps_canonical_render_event_stages(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-canonical-stages",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    canonical_stages = [
        "queued",
        "verify_alignment_cache",
        "pre_render_cached_clips",
        "build_subtitles_srt",
        "compose_filtergraph",
        "mux_mp4_faststart",
        "append_render_history_to_app_db",
    ]
    for idx, phase in enumerate(canonical_stages):
        add_render_event(
            render_id="r-canonical-stages",
            phase=phase,
            progress=float(idx),
            message=f"stage:{phase}",
        )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/renders", params={"project": str(tmp_path)})

    assert response.status_code == 200
    row = response.json()[0]
    assert [event["stage"] for event in row["events"]] == canonical_stages


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected_state"),
    [
        ("verifying", "verifying"),
        ("prerender", "prerender"),
        ("subtitles", "subtitles"),
        ("composing", "composing"),
        ("muxing", "muxing"),
        ("logging_history", "logging_history"),
    ],
)
async def test_list_renders_maps_canonical_in_progress_states(
    monkeypatch,
    tmp_path: Path,
    status: str,
    expected_state: str,
) -> None:
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "state.mp4"
    monkeypatch.setattr(
        render_routes,
        "list_renders_for_project",
        lambda project_dir, limit=10: [
            {
                "id": "r-state-mapping",
                "project_id": "p-state",
                "output_path": str(output_path),
                "preset": "final",
                "resolution": "1920x1080",
                "started_at": datetime_now().isoformat(),
                "finished_at": None,
                "duration_s": None,
                "status": status,
                "message": None,
            }
        ],
    )
    monkeypatch.setattr(
        render_routes,
        "list_render_events",
        lambda render_id: [
            {
                "id": 1,
                "render_id": render_id,
                "ts": datetime_now().isoformat(),
                "phase": "compose_filtergraph",
                "progress": 55.0,
                "message": "composing",
                "detail_json": None,
            }
        ],
    )
    monkeypatch.setattr(render_routes, "list_render_artifacts", lambda render_id: [])

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/renders", params={"project": str(tmp_path)})

    assert response.status_code == 200
    row = response.json()[0]
    assert row["events"][0]["state"] == expected_state


@pytest.mark.asyncio
async def test_reveal_render_calls_opener(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-open",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    opened: list[Path] = []
    monkeypatch.setattr(render_pipeline, "reveal_in_file_browser", opened.append)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-open/reveal",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 200
    assert opened == [output_path]


@pytest.mark.asyncio
async def test_play_render_calls_default_player(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / "renders" / "final.mp4"
    output_path.parent.mkdir()
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-play",
        project_path=tmp_path,
        output_path=output_path,
        preset="final",
        started_at=datetime_now(),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_finished(
        render_id="r-play",
        finished_at=datetime_now(),
        duration_s=2.0,
    )
    opened: list[Path] = []
    monkeypatch.setattr(render_pipeline, "open_in_default_player", opened.append)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-play/play",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 200
    assert opened == [output_path]


@pytest.mark.asyncio
async def test_play_partial_render_is_rejected(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    _write_project(tmp_path)
    output_path = tmp_path / ".vc" / "drafts" / "draft.partial"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"partial")
    insert_render(
        render_id="r-partial",
        project_path=tmp_path,
        output_path=output_path,
        preset="draft",
        started_at=datetime_now(),
        resolution="1280x720",
        width=1280,
        height=720,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/renders/r-partial/play",
            params={"project": str(tmp_path)},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RENDER_NOT_PLAYABLE"


@pytest.mark.asyncio
async def test_project_render_cache_uses_config_keys_and_detects_partial_on_media_hash_change(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    fg_item = {
        "id": "fg-1",
        "mediaId": "fg.png",
        "sentences": [1, 1],
        "start": 0,
        "end": 3,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
        "cache_status": "warm",
    }
    pip_item = {
        "id": "pip-1",
        "mediaId": "pip.png",
        "sentences": [2, 2],
        "start": 3,
        "end": 6,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
        "cache_status": "warm",
        "pip": {"posX": 80, "posY": 20, "size": 30, "radius": 12, "opacity": 90},
    }
    _write_project(
        project_dir,
        project={
            "version": 1,
            "name": "cache-project",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [
                {"id": "fg-z1", "kind": "fg", "name": "Foreground z1", "items": [fg_item]},
                {"id": "pip-z2", "kind": "pip", "name": "PiP z2", "items": [pip_item]},
            ],
            "subtitles": None,
            "watermark": None,
        },
    )
    touch_recent(project_dir, "cache-project")
    project_id = project_id_for_path(project_dir)
    media_dir = project_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    (media_dir / "fg.png").write_bytes(b"fg-v1")
    (media_dir / "pip.png").write_bytes(b"pip-v1")

    loaded = load_project(project_dir)
    fg_model_item = None
    pip_model_item = None
    for layer_container in loaded.layers:
        layer = getattr(layer_container, "root", layer_container)
        if getattr(layer, "kind", None) == "fg":
            fg_model_item = layer.items[0]
        if getattr(layer, "kind", None) == "pip":
            pip_model_item = layer.items[0]
    assert fg_model_item is not None
    assert pip_model_item is not None

    fg_cache_path = clip_cache_path_for_item(
        item=fg_model_item,
        project_dir=project_dir,
        resolution="1920x1080",
    )
    pip_cache_path = clip_cache_path_for_item(
        item=pip_model_item,
        project_dir=project_dir,
        resolution="1920x1080",
    )
    fg_cache_path.parent.mkdir(parents=True, exist_ok=True)
    fg_cache_path.write_bytes(b"fg-cache")
    pip_cache_path.write_bytes(b"pip-cache")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get(f"/projects/{project_id}/render-cache")
        (media_dir / "fg.png").write_bytes(b"fg-v2")
        second = await client.get(f"/projects/{project_id}/render-cache")

    assert first.status_code == 200
    assert first.json()["state"] == "warm"
    assert first.json()["cached_count"] == 2
    assert first.json()["total_count"] == 2

    assert second.status_code == 200
    assert second.json()["state"] == "partial"
    assert second.json()["cached_count"] == 1
    assert second.json()["total_count"] == 2


@pytest.mark.asyncio
async def test_project_render_cache_defaults_missing_resolution_to_editor_1080p_keys(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    fg_item = {
        "id": "fg-1",
        "mediaId": "fg.png",
        "sentences": [1, 1],
        "start": 0,
        "end": 3,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
        "cache_status": "warm",
    }
    _write_project(
        project_dir,
        project={
            "version": 1,
            "name": "cache-project",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [
                {"id": "fg-z1", "kind": "fg", "name": "Foreground z1", "items": [fg_item]},
            ],
            "subtitles": None,
            "watermark": None,
        },
    )
    touch_recent(project_dir, "cache-project")
    project_id = project_id_for_path(project_dir)
    media_dir = project_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    (media_dir / "fg.png").write_bytes(b"fg-v1")

    loaded = load_project(project_dir)
    fg_model_item = None
    for layer_container in loaded.layers:
        layer = getattr(layer_container, "root", layer_container)
        if getattr(layer, "kind", None) == "fg":
            fg_model_item = layer.items[0]
            break
    assert fg_model_item is not None

    legacy_draft_cache_path = clip_cache_path_for_item(
        item=fg_model_item,
        project_dir=project_dir,
        resolution="1280x720",
    )
    legacy_draft_cache_path.parent.mkdir(parents=True, exist_ok=True)
    legacy_draft_cache_path.write_bytes(b"legacy-draft-cache")

    expected_editor_cache_path = clip_cache_path_for_item(
        item=fg_model_item,
        project_dir=project_dir,
        resolution="1920x1080",
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        before_editor_default = await client.get(f"/projects/{project_id}/render-cache")
        expected_editor_cache_path.write_bytes(b"editor-default-cache")
        after_editor_default = await client.get(f"/projects/{project_id}/render-cache")

    assert before_editor_default.status_code == 200
    assert before_editor_default.json()["state"] == "cold"
    assert before_editor_default.json()["cached_count"] == 0
    assert before_editor_default.json()["total_count"] == 1

    assert after_editor_default.status_code == 200
    assert after_editor_default.json()["state"] == "warm"
    assert after_editor_default.json()["cached_count"] == 1
    assert after_editor_default.json()["total_count"] == 1


@pytest.mark.asyncio
async def test_project_render_cache_ignores_stale_invalid_status_when_expected_cache_exists(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    fg_item = {
        "id": "fg-1",
        "mediaId": "fg.png",
        "sentences": [1, 1],
        "start": 0,
        "end": 3,
        "motion": {"kind": "none", "easing": "ease_in_out"},
        "transitions": {"in": "fade", "out": "cut"},
        "cache_status": "invalid",
    }
    _write_project(
        project_dir,
        project={
            "version": 1,
            "name": "cache-project",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [
                {"id": "fg-z1", "kind": "fg", "name": "Foreground z1", "items": [fg_item]},
            ],
            "subtitles": None,
            "watermark": None,
        },
    )
    touch_recent(project_dir, "cache-project")
    project_id = project_id_for_path(project_dir)
    media_dir = project_dir / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    (media_dir / "fg.png").write_bytes(b"fg-v1")

    loaded = load_project(project_dir)
    fg_model_item = None
    for layer_container in loaded.layers:
        layer = getattr(layer_container, "root", layer_container)
        if getattr(layer, "kind", None) == "fg":
            fg_model_item = layer.items[0]
            break
    assert fg_model_item is not None

    fg_cache_path = clip_cache_path_for_item(
        item=fg_model_item,
        project_dir=project_dir,
        resolution="1920x1080",
    )
    fg_cache_path.parent.mkdir(parents=True, exist_ok=True)
    fg_cache_path.write_bytes(b"fg-cache")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/projects/{project_id}/render-cache")

    assert response.status_code == 200
    assert response.json()["state"] == "warm"
    assert response.json()["cached_count"] == 1
    assert response.json()["total_count"] == 1


@pytest.mark.asyncio
async def test_project_render_cache_marks_missing_media_as_invalid(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(
        project_dir,
        project={
            "version": 1,
            "name": "cache-project",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [
                {
                    "id": "fg-z1",
                    "kind": "fg",
                    "name": "Foreground z1",
                    "items": [
                        {
                            "id": "fg-1",
                            "mediaId": "missing.png",
                            "sentences": [1, 1],
                            "start": 0,
                            "end": 3,
                            "motion": {"kind": "none", "easing": "ease_in_out"},
                            "transitions": {"in": "fade", "out": "cut"},
                            "cache_status": "warm",
                        }
                    ],
                }
            ],
            "subtitles": None,
            "watermark": None,
        },
    )
    touch_recent(project_dir, "cache-project")
    project_id = project_id_for_path(project_dir)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/projects/{project_id}/render-cache")

    assert response.status_code == 200
    assert response.json()["state"] == "invalid"
    assert response.json()["cached_count"] == 0
    assert response.json()["total_count"] == 1


@pytest.mark.asyncio
async def test_project_render_cache_does_not_swallow_unexpected_clip_key_errors(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    _write_project(
        project_dir,
        project={
            "version": 1,
            "name": "cache-project",
            "audio": "voice.wav",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [
                {
                    "id": "fg-z1",
                    "kind": "fg",
                    "name": "Foreground z1",
                    "items": [
                        {
                            "id": "fg-1",
                            "mediaId": "fg.png",
                            "sentences": [1, 1],
                            "start": 0,
                            "end": 3,
                            "motion": {"kind": "none", "easing": "ease_in_out"},
                            "transitions": {"in": "fade", "out": "cut"},
                            "cache_status": "warm",
                        }
                    ],
                }
            ],
            "subtitles": None,
            "watermark": None,
        },
    )
    touch_recent(project_dir, "cache-project")
    project_id = project_id_for_path(project_dir)

    def raise_type_error(*args, **kwargs):
        raise TypeError("bad clip shape")

    monkeypatch.setattr(project_routes, "clip_cache_path_for_item", raise_type_error)

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/projects/{project_id}/render-cache")

    assert response.status_code == 500


def datetime_now():
    from datetime import UTC, datetime

    return datetime.now(UTC)
