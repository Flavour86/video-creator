import json
import shutil
import struct
import wave
from pathlib import Path

import httpx
import pytest

from server.db.app_db import connection
from server.db.projects import touch_recent
from server.db.renders import add_render_artifact
from server.main import app
from server.pipeline.cache import compute_alignment_hash
from server.settings import settings


def _write_wav(path: Path, duration_secs: float = 2.0) -> None:
    sample_rate = 16000
    sample_count = int(sample_rate * duration_secs)
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack(f"<{sample_count}h", *([0] * sample_count)))


def _write_project(project_dir: Path, transcript: str) -> None:
    project_dir.mkdir()
    (project_dir / "media").mkdir()
    (project_dir / ".vc").mkdir()
    (project_dir / "transcript.txt").write_text(transcript, encoding="utf-8")
    _write_wav(project_dir / "voice.wav")
    (project_dir / "project.json").write_text(
        json.dumps(
            {
                "version": 1,
                "name": "Rich Metadata",
                "audio": "voice.wav",
                "transcript": {"kind": "plain_text", "path": "transcript.txt"},
                "output": {"preset": "draft"},
                "layers": [],
                "subtitles": None,
                "watermark": None,
            }
        ),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_create_project(tmp_path) -> None:
    target = tmp_path / "newproj"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json={"path": str(target), "name": "Test"})
        list_response = await client.get("/projects")
    assert response.status_code == 200
    project_id = response.json()["project_id"]
    assert project_id.startswith("p_")
    assert list_response.status_code == 200
    card = list_response.json()["items"][0]
    assert card["project_id"] == project_id
    assert card["thumbnail_path"].endswith("/project-placeholder.svg")
    assert (target / "media").is_dir()
    assert (target / "renders").is_dir()
    assert (target / ".vc").is_dir()
    assert (target / "transcript.txt").is_file()
    assert (target / "voice.wav").is_file()
    assert (target / "subtitles.srt").is_file()
    assert (target / ".vc" / "alignment.json").is_file()
    assert (target / ".vc" / "clips").is_dir()
    assert (target / ".vc" / "drafts").is_dir()
    assert (target / ".vc" / "thumbs").is_dir()
    assert (target / ".vc" / "thumbs" / "project-placeholder.svg").is_file()
    assert (target / ".vc" / "logs").is_dir()


@pytest.mark.asyncio
async def test_new_folder_project_alias(tmp_path) -> None:
    target = tmp_path / "new-folder"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/new-folder",
            json={"path": str(target), "name": "New Folder"},
        )
    assert response.status_code == 200
    assert response.json()["project_id"].startswith("p_")


@pytest.mark.asyncio
async def test_create_project_rejects_non_empty_directory(tmp_path) -> None:
    target = tmp_path / "newproj"
    target.mkdir()
    (target / "existing.txt").write_text("x", encoding="utf-8")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects", json={"path": str(target), "name": "Test"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NOT_EMPTY"


@pytest.mark.asyncio
async def test_new_folder_reports_permission_denied(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    target = tmp_path / "denied"
    real_mkdir = Path.mkdir

    def deny_target(path: Path, *args: object, **kwargs: object) -> None:
        if path == target:
            raise PermissionError("denied")
        return real_mkdir(path, *args, **kwargs)

    monkeypatch.setattr(Path, "mkdir", deny_target)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/projects/new-folder",
            json={"path": str(target), "name": "Denied"},
        )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_recent_open_and_remove_project(monkeypatch, tmp_path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    target = tmp_path / "newproj"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/projects", json={"path": str(target), "name": "Test"}
        )
        assert create_response.status_code == 200

        recent_response = await client.get("/projects/recent")
        assert recent_response.status_code == 200
        assert recent_response.json()[0]["name"] == "Test"
        assert recent_response.json()[0]["last_render_at"]

        open_response = await client.post("/projects/open", json={"path": str(target)})
        assert open_response.status_code == 200
        assert open_response.json()["path"] == str(target)

        remove_response = await client.request(
            "DELETE", "/projects/recent", json={"path": str(target)}
        )
        assert remove_response.status_code == 200
        assert (await client.get("/projects/recent")).json() == []


@pytest.mark.asyncio
async def test_projects_list_returns_project_id_cards_without_paths(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "metadata"
    _write_project(project_dir, "First sentence. Second sentence.")
    touch_recent(project_dir, "Rich Metadata")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects")

    assert response.status_code == 200
    payload = response.json()
    assert payload["pagination"]["total_count"] == 1
    project = payload["items"][0]
    assert project["project_id"].startswith("p_")
    assert "path" not in project
    assert project["name"] == "Rich Metadata"
    assert project["last_render_at"]
    assert project["sentence_count"] == 2
    assert project["status"] == "ready"
    assert project["has_unrendered_changes"] is False


@pytest.mark.asyncio
async def test_projects_list_represents_missing_and_corrupt_projects(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    missing = tmp_path / "missing"
    corrupt = tmp_path / "corrupt"
    corrupt.mkdir()
    (corrupt / "project.json").write_text("{not json", encoding="utf-8")
    touch_recent(missing, "Missing")
    touch_recent(corrupt, "Corrupt")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects")

    assert response.status_code == 200
    assert response.json()["items"] == []
    with connection() as conn:
        count_row = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()
    assert count_row is not None
    assert int(count_row["c"]) == 0


@pytest.mark.asyncio
async def test_projects_list_paginates_and_sorts_by_last_render_time(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    for name in ("alpha", "bravo", "charlie"):
        project_dir = tmp_path / name
        _write_project(project_dir, f"{name} sentence.")
        touch_recent(project_dir, name.title())

    with connection() as conn:
        conn.execute(
            "UPDATE projects SET last_render_at = ? WHERE project_name = ?",
            ("2026-05-07T12:00:00+00:00", "Alpha"),
        )
        conn.execute(
            "UPDATE projects SET last_render_at = ? WHERE project_name = ?",
            ("2026-05-08T12:00:00+00:00", "Bravo"),
        )
        conn.execute(
            "UPDATE projects SET last_render_at = ? WHERE project_name = ?",
            ("2026-05-06T12:00:00+00:00", "Charlie"),
        )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/projects", params={"page_size": 2, "page_index": 0})
        second = await client.get("/projects", params={"page_size": 2, "page_index": 1})

    assert first.status_code == 200
    assert first.json()["pagination"] == {
        "page_size": 2,
        "page_index": 0,
        "total_count": 3,
        "total_pages": 2,
    }
    assert [project["name"] for project in first.json()["items"]] == ["Bravo", "Alpha"]
    assert [project["name"] for project in second.json()["items"]] == ["Charlie"]


@pytest.mark.asyncio
async def test_projects_list_maps_render_status_tag(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "rendered"
    _write_project(project_dir, "First sentence.")
    touch_recent(project_dir, "Rendered")
    thumb = project_dir / ".vc" / "thumbs" / "render-r_done.jpg"
    thumb.parent.mkdir(parents=True)
    thumb.write_bytes(b"thumb")
    project_id = ""
    with connection() as conn:
        row = conn.execute("SELECT project_id FROM projects WHERE project_path = ?", (str(project_dir.resolve()),)).fetchone()
        assert row is not None
        project_id = str(row["project_id"])
        conn.execute(
            """
            INSERT INTO render_history (
                id, project_id, output_path, preset, resolution, width, height, status, started_at, finished_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "r_done",
                project_id,
                str(project_dir / "renders" / "final.mp4"),
                "final",
                "1920x1080",
                1920,
                1080,
                "rendered",
                "2026-05-08T12:00:00+00:00",
                "2026-05-08T12:01:00+00:00",
            ),
        )
        conn.execute(
            """
            INSERT INTO render_history (
                id, project_id, output_path, preset, resolution, width, height, status, started_at, finished_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "r_failed",
                project_id,
                str(project_dir / "renders" / "failed.mp4"),
                "final",
                "1920x1080",
                1920,
                1080,
                "failed",
                "2026-05-08T12:02:00+00:00",
                "2026-05-08T12:03:00+00:00",
            ),
        )
    add_render_artifact(render_id="r_done", kind="thumbnail", path=thumb)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects")

    assert response.status_code == 200
    project = response.json()["items"][0]
    assert project["latest_render_id"] == "r_done"
    assert project["latest_render_status"] == "done"
    assert project["render_status_tag"] == "failed"
    assert project["thumbnail_path"].endswith("/render-r_done.jpg")


@pytest.mark.asyncio
async def test_project_id_config_inspect_and_delete_routes(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "project-id"
    _write_project(project_dir, "First sentence. Second sentence.")
    touch_recent(project_dir, "Project Id")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        projects = (await client.get("/projects")).json()["items"]
        project_id = projects[0]["project_id"]

        config_response = await client.get(f"/projects/{project_id}/config")
        inspect_response = await client.post(f"/projects/{project_id}/inspect")
        save_response = await client.put(
            f"/projects/{project_id}/config",
            json={"config": {**json.loads((project_dir / "project.json").read_text()), "name": "Saved"}},
        )
        delete_response = await client.delete(f"/projects/{project_id}")

    assert config_response.status_code == 200
    assert config_response.json()["project_id"] == project_id
    assert inspect_response.status_code == 200
    assert inspect_response.json()["name"] == "Rich Metadata"
    assert save_response.status_code == 200
    assert save_response.json()["config_hash"].startswith("sha256:")
    assert delete_response.status_code == 200


@pytest.mark.asyncio
async def test_recent_projects_include_voice_transcript_media_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "metadata"
    _write_project(project_dir, "First sentence. Second sentence.")
    (project_dir / "media" / "a.png").write_bytes(b"a")
    (project_dir / "media" / "b.jpg").write_bytes(b"b")
    touch_recent(project_dir, "Rich Metadata")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/recent")

    assert response.status_code == 200
    project = response.json()[0]
    assert project["voice_duration"] == "00:02"
    assert project["sentence_count"] == 2
    assert project["media_count"] == 2
    assert project["alignment_state"] == "pending"


@pytest.mark.asyncio
async def test_recent_projects_keep_missing_paths_as_missing_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    missing = tmp_path / "missing"
    touch_recent(missing, "Missing")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/recent")

    assert response.status_code == 200
    project = response.json()[0]
    assert project["voice_duration"] == ""
    assert project["sentence_count"] == 0
    assert project["media_count"] == 0
    assert project["alignment_state"] == "missing"


@pytest.mark.asyncio
async def test_recent_projects_use_current_alignment_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "aligned"
    transcript = "First sentence. Second sentence."
    _write_project(project_dir, transcript)
    (project_dir / ".vc" / "alignment.json").write_text(
        json.dumps(
            {
                "sentences": [
                    {
                        "index": 1,
                        "text": "Aligned sentence.",
                        "start_s": 0.0,
                        "end_s": 2.0,
                        "confidence_avg": 0.9,
                    }
                ],
                "words": [],
                "cache_hit": False,
            }
        ),
        encoding="utf-8",
    )
    (project_dir / ".vc" / "alignment.hash").write_text(
        compute_alignment_hash(project_dir / "voice.wav", transcript),
        encoding="utf-8",
    )
    touch_recent(project_dir, "Aligned")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/recent")

    assert response.status_code == 200
    project = response.json()[0]
    assert project["sentence_count"] == 1
    assert project["alignment_state"] == "aligned"


@pytest.mark.asyncio
async def test_recent_projects_detect_test01_raw_ingredients(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source = Path(__file__).resolve().parents[3] / "projects" / "test01"
    if not source.is_dir():
        pytest.skip("projects/test01 fixture is not available in this checkout")

    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "test01"
    shutil.copytree(source, project_dir, ignore=shutil.ignore_patterns(".vc", "renders"))
    touch_recent(project_dir, "test01")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects/recent")

    assert response.status_code == 200
    project = response.json()[0]
    assert project["voice_duration"]
    assert project["sentence_count"] >= 20
    assert project["media_count"] == 5
    assert project["alignment_state"] == "pending"


@pytest.mark.asyncio
async def test_put_project_config_uses_single_canonical_row_and_stable_hash(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "canonical-config"
    _write_project(project_dir, "First sentence.")
    touch_recent(project_dir, "Canonical Config")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = (await client.get("/projects")).json()["items"][0]["project_id"]
        base = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
        first = await client.put(f"/projects/{project_id}/config", json={"config": base})
        reordered = {
            "watermark": base["watermark"],
            "subtitles": base["subtitles"],
            "layers": base["layers"],
            "output": base["output"],
            "transcript": base["transcript"],
            "audio": base["audio"],
            "name": base["name"],
            "version": base["version"],
        }
        second = await client.put(f"/projects/{project_id}/config", json={"config": reordered})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["config_hash"] == second.json()["config_hash"]

    with connection() as conn:
        count_row = conn.execute("SELECT COUNT(*) AS c FROM project_configs").fetchone()
    assert count_row is not None
    assert int(count_row["c"]) == 1


@pytest.mark.asyncio
async def test_put_project_config_updates_hash_and_dirty_state(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "dirty-state"
    _write_project(project_dir, "First sentence.")
    touch_recent(project_dir, "Dirty State")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = (await client.get("/projects")).json()["items"][0]["project_id"]
        base = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
        initial = await client.put(f"/projects/{project_id}/config", json={"config": base})
        first_hash = initial.json()["config_hash"]

        with connection() as conn:
            conn.execute(
                """
                UPDATE projects
                SET last_rendered_config_hash = ?, has_unrendered_changes = 0
                WHERE project_id = ?
                """,
                (first_hash, project_id),
            )

        same_save = await client.put(f"/projects/{project_id}/config", json={"config": base})
        changed = dict(base)
        changed["name"] = "Dirty State Changed"
        changed_save = await client.put(f"/projects/{project_id}/config", json={"config": changed})

    assert same_save.status_code == 200
    assert same_save.json()["config_hash"] == first_hash
    assert same_save.json()["has_unrendered_changes"] is False
    assert changed_save.status_code == 200
    assert changed_save.json()["config_hash"] != first_hash
    assert changed_save.json()["has_unrendered_changes"] is True


@pytest.mark.asyncio
async def test_put_project_config_rejects_schema_invalid_without_partial_write(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
    project_dir = tmp_path / "invalid-config"
    _write_project(project_dir, "First sentence.")
    touch_recent(project_dir, "Invalid Config")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        project_id = (await client.get("/projects")).json()["items"][0]["project_id"]
        base = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
        ok = await client.put(f"/projects/{project_id}/config", json={"config": base})
        before_hash = ok.json()["config_hash"]
        invalid = dict(base)
        invalid["ai"] = {"provider": "future"}
        bad = await client.put(f"/projects/{project_id}/config", json={"config": invalid})

    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "INVALID_PROJECT_CONFIG"
    with connection() as conn:
        row = conn.execute(
            """
            SELECT p.current_config_hash, c.config_hash
            FROM projects p
            JOIN project_configs c ON c.project_id = p.project_id
            WHERE p.project_path = ?
            """,
            (str(project_dir.resolve()),),
        ).fetchone()
    assert row is not None
    assert row["current_config_hash"] == before_hash
    assert row["config_hash"] == before_hash
