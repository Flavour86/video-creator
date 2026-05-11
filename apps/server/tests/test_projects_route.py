import json
import shutil
import struct
import wave
from pathlib import Path

import httpx
import pytest

from server.db.projects import touch_recent
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
    assert response.status_code == 200
    assert (target / "project.json").exists()
    assert (target / "media").is_dir()
    assert (target / "renders").is_dir()
    assert (target / ".vc").is_dir()


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
    assert (target / "project.json").exists()


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
    project = response.json()[0]
    assert project["project_id"].startswith("p_")
    assert "path" not in project
    assert project["name"] == "Rich Metadata"
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
    by_name = {project["name"]: project for project in response.json()}
    assert by_name["Missing"]["status"] == "missing"
    assert by_name["Corrupt"]["status"] == "corrupt"


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
        projects = (await client.get("/projects")).json()
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
