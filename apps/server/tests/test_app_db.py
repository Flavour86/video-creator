from pathlib import Path

from server.db.app_db import connection, init_db
from server.db.projects import list_recent, remove_recent, touch_recent
from server.settings import settings


def test_init_creates_tables(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    names = [row["name"] for row in rows]
    assert "recent_projects" in names
    assert "app_settings" in names
    assert "render_history" in names


def test_recent_round_trip(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_path = tmp_path / "myproj"
    project_path.mkdir()
    touch_recent(project_path, "My Project")
    rows = list_recent()
    assert len(rows) == 1
    assert rows[0]["name"] == "My Project"
    remove_recent(project_path)
    assert list_recent() == []
