from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from server.db.renders import (
    insert_render,
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
    )
    mark_render_finished(
        render_id="r-test",
        finished_at=finished_at,
        duration_s=60.0,
    )

    rows = list_renders_for_project(project_dir)
    assert len(rows) == 1
    assert rows[0]["id"] == "r-test"
    assert rows[0]["status"] == "done"
    assert rows[0]["duration_s"] == 60.0


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
    )
    mark_render_failed(
        render_id="r-failed",
        finished_at=finished_at,
        message="ffmpeg failed",
    )

    rows = list_renders_for_project(project_dir)
    assert len(rows) == 1
    assert rows[0]["status"] == "error"
    assert rows[0]["message"] == "ffmpeg failed"
