from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from server.db.renders import (
    add_render_artifact,
    add_render_event,
    delete_render,
    insert_render,
    list_render_artifacts,
    list_render_events,
    list_renders_for_project,
    mark_render_failed,
    mark_render_finished,
)
from server.db.project_configs import save_config_snapshot
from server.db.projects import get_project_by_path
from server.settings import settings


def test_render_history_records_finished_render(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    output_path = project_dir / ".vc" / "drafts" / "draft.mp4"
    started_at = datetime(2026, 5, 7, 12, 0, tzinfo=UTC)
    finished_at = datetime(2026, 5, 7, 12, 1, tzinfo=UTC)

    insert_render(
        render_id="r-test",
        project_path=project_dir,
        output_path=output_path,
        preset="draft",
        started_at=started_at,
        resolution="1280x720",
        width=1280,
        height=720,
    )
    mark_render_finished(
        render_id="r-test",
        finished_at=finished_at,
        duration_s=60.0,
    )

    rows = list_renders_for_project(project_dir)
    assert len(rows) == 1
    assert rows[0]["id"] == "r-test"
    assert rows[0]["status"] == "rendered"
    assert rows[0]["duration_s"] == 60.0
    artifacts = list_render_artifacts("r-test")
    assert artifacts[0]["kind"] == "output"
    assert artifacts[0]["size_bytes"] is None


def test_finished_render_marks_project_config_rendered(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    save_config_snapshot(
        project_dir,
        {
            "version": 1,
            "name": "test",
            "audio": "",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [],
            "subtitles": None,
            "watermark": None,
        },
    )
    before = get_project_by_path(project_dir)
    assert before is not None
    assert before["has_unrendered_changes"] == 1

    insert_render(
        render_id="r-rendered",
        project_path=project_dir,
        output_path=project_dir / "renders" / "final.mp4",
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_finished(
        render_id="r-rendered",
        finished_at=datetime(2026, 5, 7, 12, 1, tzinfo=UTC),
        duration_s=60.0,
    )

    after = get_project_by_path(project_dir)
    assert after is not None
    assert after["last_rendered_config_hash"] == before["current_config_hash"]
    assert after["has_unrendered_changes"] == 0


def test_insert_render_captures_current_config_hash(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    digest = save_config_snapshot(
        project_dir,
        {
            "version": 1,
            "name": "test",
            "audio": "",
            "transcript": {"kind": "plain_text", "path": "transcript.txt"},
            "output": {"preset": "draft"},
            "layers": [],
            "subtitles": None,
            "watermark": None,
        },
    )
    insert_render(
        render_id="r-hash",
        project_path=project_dir,
        output_path=project_dir / ".vc" / "drafts" / "draft.mp4",
        preset="draft",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1280x720",
        width=1280,
        height=720,
    )

    rows = list_renders_for_project(project_dir)
    assert rows[0]["id"] == "r-hash"
    assert rows[0]["config_hash"] == digest


def test_render_history_records_failed_render(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    started_at = datetime(2026, 5, 7, 12, 0, tzinfo=UTC)
    finished_at = datetime(2026, 5, 7, 12, 1, tzinfo=UTC)

    insert_render(
        render_id="r-failed",
        project_path=project_dir,
        output_path=project_dir / "renders" / "failed.mp4",
        preset="final",
        started_at=started_at,
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    mark_render_failed(
        render_id="r-failed",
        finished_at=finished_at,
        message="ffmpeg failed",
    )

    rows = list_renders_for_project(project_dir)
    assert len(rows) == 1
    assert rows[0]["status"] == "failed"
    assert rows[0]["message"] == "ffmpeg failed"


def test_render_artifacts_and_events_round_trip(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    output_path = project_dir / "renders" / "final.mp4"
    output_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"mp4")
    insert_render(
        render_id="r-artifacts",
        project_path=project_dir,
        output_path=output_path,
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )

    artifact_id = add_render_artifact(
        render_id="r-artifacts",
        kind="output",
        path=output_path,
    )
    add_render_event(
        render_id="r-artifacts",
        phase="compose",
        message="encoding",
        progress=50.0,
        detail_json={"step": "mux"},
    )

    artifacts = list_render_artifacts("r-artifacts")
    events = list_render_events("r-artifacts")
    assert artifacts[0]["id"] == artifact_id
    assert artifacts[0]["size_bytes"] == 3
    assert events[0]["phase"] == "compose"
    assert events[0]["progress"] == 50.0
    assert events[0]["detail_json"] == '{"step":"mux"}'


def test_delete_render_removes_generated_artifacts_and_rows(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_dir = tmp_path / "project"
    output_path = project_dir / "renders" / "final.mp4"
    source_path = project_dir / "media" / "source.mp4"
    output_path.parent.mkdir(parents=True)
    source_path.parent.mkdir(parents=True)
    output_path.write_bytes(b"mp4")
    source_path.write_bytes(b"source")
    insert_render(
        render_id="r-delete",
        project_path=project_dir,
        output_path=output_path,
        preset="final",
        started_at=datetime(2026, 5, 7, 12, 0, tzinfo=UTC),
        resolution="1920x1080",
        width=1920,
        height=1080,
    )
    add_render_artifact(
        render_id="r-delete",
        kind="output",
        path=output_path,
    )
    add_render_artifact(
        render_id="r-delete",
        kind="thumbnail",
        path=source_path,
    )
    add_render_event(
        render_id="r-delete",
        phase="queued",
    )

    deleted = delete_render("r-delete")

    assert deleted is not None
    assert not output_path.exists()
    assert source_path.exists()
    assert list_render_artifacts("r-delete") == []
    assert list_render_events("r-delete") == []
