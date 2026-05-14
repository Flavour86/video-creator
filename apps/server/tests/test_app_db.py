from pathlib import Path
import sqlite3

import pytest

from server.db.app_db import connection, init_db
from server.db.migrations import load_migrations
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
        (5, "spec_cleanup"),
        (6, "projects_canonical"),
        (7, "project_configs_canonical"),
        (8, "render_history_canonical"),
        (9, "render_artifacts_events_canonical"),
        (10, "app_settings_whitelist"),
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
        project = conn.execute(
            "SELECT project_name FROM projects WHERE project_path = 'E:/demo'"
        ).fetchone()
        migration = conn.execute("SELECT version FROM schema_migrations").fetchone()
        migrated_project = conn.execute(
            "SELECT project_id, project_name FROM projects WHERE project_path = 'E:/demo'"
        ).fetchone()
    assert project["project_name"] == "Demo"
    assert migration["version"] == 1
    assert migrated_project["project_id"].startswith("p_")
    assert migrated_project["project_name"] == "Demo"


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


def test_connection_applies_required_pragmas(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    with connection() as conn:
        foreign_keys = conn.execute("PRAGMA foreign_keys").fetchone()[0]
        journal_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        synchronous = conn.execute("PRAGMA synchronous").fetchone()[0]
        busy_timeout = conn.execute("PRAGMA busy_timeout").fetchone()[0]
        temp_store = conn.execute("PRAGMA temp_store").fetchone()[0]

    assert foreign_keys == 1
    assert str(journal_mode).lower() == "wal"
    assert synchronous == 1
    assert busy_timeout == 5000
    assert temp_store == 2


def test_init_recovers_corrupted_db_with_backup(monkeypatch, tmp_path: Path) -> None:
    db_path = tmp_path / "corrupt.db"
    db_path.write_bytes(b"not a sqlite database")
    monkeypatch.setattr(settings, "app_db_path", db_path)

    result = init_db()

    assert result.warning is not None
    assert result.backup_path is not None
    assert result.backup_path.exists()
    assert "Backup created at" in result.warning
    with connection() as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
        ).fetchone()
    assert row is not None


def test_render_history_migration_backfills_missing_projects(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    migration_sql = (
        Path(__file__).resolve().parents[1]
        / "server"
        / "db"
        / "migrations"
        / "008_render_history_canonical.sql"
    ).read_text(encoding="utf-8")

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            """
            CREATE TABLE projects (
                project_id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL UNIQUE,
                project_name TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_render_at TEXT NOT NULL DEFAULT (datetime('now')),
                voice_duration_s REAL,
                sentence_count INTEGER NOT NULL DEFAULT 0,
                media_count INTEGER NOT NULL DEFAULT 0,
                thumbnail_path TEXT,
                palette_seed TEXT NOT NULL DEFAULT 'night',
                project_mtime TEXT,
                current_config_hash TEXT,
                last_rendered_config_hash TEXT,
                has_unrendered_changes INTEGER NOT NULL DEFAULT 1,
                last_error TEXT
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
            INSERT INTO render_history (
                id, project_path, output_path, preset, started_at, status
            ) VALUES (
                'r-orphan',
                'E:/legacy/missing-project',
                'E:/legacy/missing-project/renders/out.mp4',
                'final',
                '2026-05-10T00:00:00Z',
                'done'
            );
            """
        )
        conn.executescript(migration_sql)

        row = conn.execute(
            """
            SELECT rh.id, rh.project_id, p.project_path, p.project_name, rh.status
            FROM render_history rh
            JOIN projects p ON p.project_id = rh.project_id
            WHERE rh.id = 'r-orphan'
            """
        ).fetchone()

    assert row is not None
    assert str(row["project_id"]).startswith("p_")
    assert row["project_path"] == "E:/legacy/missing-project"
    assert row["project_name"] == "E:/legacy/missing-project"
    assert row["status"] == "rendered"


def test_render_artifacts_events_survive_legacy_to_canonical_migration(
    monkeypatch, tmp_path: Path
) -> None:
    db_path = tmp_path / "legacy-renders.db"
    migrations_dir = Path(__file__).resolve().parents[1] / "server" / "db" / "migrations"
    initial_migrations = [migration for migration in load_migrations(migrations_dir) if migration.version <= 7]

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        for migration in initial_migrations:
            conn.executescript(migration.sql)
            conn.execute(
                "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
                (migration.version, migration.name, migration.checksum),
            )

        conn.execute(
            """
            INSERT INTO render_history (
                id, project_path, output_path, preset, started_at, finished_at, duration_s, status, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "r-legacy",
                "E:/legacy/project-1",
                "E:/legacy/project-1/renders/out.mp4",
                "final",
                "2026-05-10T00:00:00Z",
                "2026-05-10T00:01:00Z",
                60.0,
                "done",
                "legacy done",
            ),
        )
        conn.execute(
            """
            INSERT INTO render_artifacts (
                artifact_id, render_id, project_id, kind, path, size, hash, playable, reusable, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "a-legacy",
                "r-legacy",
                "p-legacy",
                "final_mp4",
                "E:/legacy/project-1/renders/out.mp4",
                123,
                "sha256:deadbeef",
                1,
                1,
                "2026-05-10T00:01:00Z",
            ),
        )
        conn.execute(
            """
            INSERT INTO render_events (
                render_id, project_id, stage, status, message, progress, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "r-legacy",
                "p-legacy",
                "compose",
                "running",
                "encoding",
                42.0,
                "2026-05-10T00:00:30Z",
            ),
        )

    monkeypatch.setattr(settings, "app_db_path", db_path)
    init_db()

    with connection() as conn:
        history_row = conn.execute(
            """
            SELECT id, project_id, status, resolution, width, height
            FROM render_history
            WHERE id = 'r-legacy'
            """
        ).fetchone()
        artifact_row = conn.execute(
            """
            SELECT render_id, kind, path, size_bytes
            FROM render_artifacts
            WHERE render_id = 'r-legacy'
            """
        ).fetchone()
        event_row = conn.execute(
            """
            SELECT render_id, phase, progress, message, detail_json, ts
            FROM render_events
            WHERE render_id = 'r-legacy'
            ORDER BY id
            LIMIT 1
            """
        ).fetchone()

    assert history_row is not None
    assert history_row["status"] == "rendered"
    assert str(history_row["project_id"]).startswith("p_")
    assert history_row["resolution"] == "1920x1080"
    assert history_row["width"] == 1920
    assert history_row["height"] == 1080

    assert artifact_row is not None
    assert artifact_row["render_id"] == "r-legacy"
    assert artifact_row["kind"] == "output"
    assert artifact_row["path"] == "E:/legacy/project-1/renders/out.mp4"
    assert artifact_row["size_bytes"] == 123

    assert event_row is not None
    assert event_row["render_id"] == "r-legacy"
    assert event_row["phase"] == "compose"
    assert event_row["progress"] == 42.0
    assert event_row["message"] == "encoding"
    assert event_row["detail_json"] == '{"status":"running"}'
    assert event_row["ts"] == "2026-05-10T00:00:30Z"


def test_app_settings_only_accepts_whitelisted_keys(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    init_db()

    with connection() as conn:
        conn.execute(
            "INSERT INTO app_settings(key, value) VALUES (?, ?)",
            ("default_output_preset", "E:/projects"),
        )

    with pytest.raises(sqlite3.IntegrityError):
        with connection() as conn:
            conn.execute(
                "INSERT INTO app_settings(key, value) VALUES (?, ?)",
                ("theme", "night"),
            )

    with connection() as conn:
        keys = {
            str(row["key"])
            for row in conn.execute(
                "SELECT key FROM app_settings ORDER BY key"
            ).fetchall()
        }

    assert keys == {"default_output_preset"}


def test_ui_preferences_are_not_persisted_in_app_settings(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    init_db()

    for key in ("theme", "language"):
        with pytest.raises(sqlite3.IntegrityError):
            with connection() as conn:
                conn.execute(
                    "INSERT INTO app_settings(key, value) VALUES (?, ?)",
                    (key, "ignored"),
                )

    with connection() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM app_settings WHERE key IN (?, ?)",
            ("theme", "language"),
        ).fetchone()["c"]
    assert count == 0
