"""Recent-projects CRUD."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from server.db.app_db import connection


def project_id_for_path(path: Path) -> str:
    normalized = str(path.resolve())
    digest = hashlib.sha256(normalized.casefold().encode("utf-8")).hexdigest()[:24]
    return f"p_{digest}"


def touch_recent(path: Path, name: str) -> None:
    normalized_path = str(path.resolve())
    opened_at = datetime.now(UTC).isoformat()
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO recent_projects (path, name, last_opened_at)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name = excluded.name,
                last_opened_at = excluded.last_opened_at
            """,
            (normalized_path, name, opened_at),
        )
        conn.execute(
            """
            INSERT INTO projects (
                project_id,
                path,
                name,
                status,
                alignment_state,
                created_at,
                updated_at,
                last_opened_at
            )
            VALUES (?, ?, ?, 'ready', 'missing', ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name = excluded.name,
                status = CASE
                    WHEN projects.status IN ('missing', 'corrupt') THEN projects.status
                    ELSE excluded.status
                END,
                updated_at = excluded.updated_at,
                last_opened_at = excluded.last_opened_at
            """,
            (project_id_for_path(path), normalized_path, name, opened_at, opened_at, opened_at),
        )


def list_recent(limit: int = 20) -> list[dict[str, str]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT path, name, last_opened_at FROM recent_projects "
            "ORDER BY last_opened_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def list_projects(limit: int = 20) -> list[dict[str, object]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                project_id,
                path,
                name,
                status,
                alignment_state,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                render_enabled,
                latest_render_id,
                latest_render_status,
                created_at,
                updated_at,
                last_opened_at
            FROM projects
            ORDER BY last_opened_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_project(project_id: str) -> dict[str, object] | None:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT
                project_id,
                path,
                name,
                status,
                alignment_state,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                render_enabled,
                latest_render_id,
                latest_render_status,
                created_at,
                updated_at,
                last_opened_at
            FROM projects
            WHERE project_id = ?
            """,
            (project_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def project_path_for_id(project_id: str) -> Path | None:
    project = get_project(project_id)
    if project is None:
        return None
    return Path(str(project["path"]))


def get_project_by_path(path: Path) -> dict[str, object] | None:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT
                project_id,
                path,
                name,
                status,
                alignment_state,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                render_enabled,
                latest_render_id,
                latest_render_status,
                created_at,
                updated_at,
                last_opened_at
            FROM projects
            WHERE path = ?
            """,
            (str(path.resolve()),),
        ).fetchone()
    return dict(row) if row is not None else None


def mark_project_rendered(project_path: Path) -> None:
    now = datetime.now(UTC).isoformat()
    with connection() as conn:
        conn.execute(
            """
            UPDATE projects
            SET last_rendered_config_hash = current_config_hash,
                has_unrendered_changes = 0,
                updated_at = ?
            WHERE path = ? AND current_config_hash IS NOT NULL
            """,
            (now, str(project_path.resolve())),
        )


def remove_recent(path: Path) -> None:
    normalized_path = str(path.resolve())
    with connection() as conn:
        conn.execute("DELETE FROM recent_projects WHERE path = ?", (normalized_path,))
        conn.execute("DELETE FROM projects WHERE path = ?", (normalized_path,))
