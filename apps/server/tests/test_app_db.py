from pathlib import Path
import sqlite3

from server.db.app_db import connection, init_db
from server.db.projects import list_projects, list_recent, project_id_for_path, remove_recent, touch_recent
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
    assert "projects" in names
    assert "app_settings" in names
    assert "project_configs" in names
    assert "render_artifacts" in names
    assert "render_events" in names
    assert "render_history" in names
    assert "schema_migrations" in names


def test_init_records_migration_once(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    init_db()
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT version, name FROM schema_migrations ORDER BY version"
        ).fetchall()
    assert [(row["version"], row["name"]) for row in rows] == [
        (1, "initial"),
        (2, "projects"),
        (3, "project_configs"),
        (4, "render_artifacts_events"),
    ]


def test_init_upgrades_existing_inline_schema_without_data_loss(
    monkeypatch, tmp_path: Path
) -> None:
    db_path = tmp_path / "old.db"
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE recent_projects (
                path TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE render_history (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                output_path TEXT NOT NULL,
                preset TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                duration_s REAL,
                status TEXT NOT NULL,
                message TEXT
            );
            INSERT INTO recent_projects (path, name, last_opened_at)
            VALUES ('E:/demo', 'Demo', '2026-05-09T00:00:00Z');
            """
        )

    monkeypatch.setattr(settings, "app_db_path", db_path)
    init_db()

    with connection() as conn:
        project = conn.execute("SELECT name FROM recent_projects WHERE path = 'E:/demo'").fetchone()
        migration = conn.execute("SELECT version FROM schema_migrations").fetchone()
        migrated_project = conn.execute("SELECT project_id, name FROM projects WHERE path = 'E:/demo'").fetchone()
    assert project["name"] == "Demo"
    assert migration["version"] == 1
    assert migrated_project["project_id"].startswith("p_")
    assert migrated_project["name"] == "Demo"


def test_recent_round_trip(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    project_path = tmp_path / "myproj"
    project_path.mkdir()
    touch_recent(project_path, "My Project")
    rows = list_recent()
    project_rows = list_projects()
    assert len(rows) == 1
    assert rows[0]["name"] == "My Project"
    assert project_rows[0]["project_id"] == project_id_for_path(project_path)
    assert project_rows[0]["name"] == "My Project"
    remove_recent(project_path)
    assert list_recent() == []
    assert list_projects() == []
