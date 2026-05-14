"""Projects index CRUD."""

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
    now = datetime.now(UTC).isoformat()
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO projects (
                project_id,
                project_path,
                project_name,
                created_at,
                last_render_at,
                has_unrendered_changes
            )
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(project_path) DO UPDATE SET
                project_name = excluded.project_name
            """,
            (project_id_for_path(path), normalized_path, name, now, now),
        )


def list_recent(limit: int = 20) -> list[dict[str, str]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                project_path AS path,
                project_name AS name,
                last_render_at
            FROM projects
            ORDER BY last_render_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def list_projects(limit: int = 20) -> list[dict[str, object]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                project_id,
                project_path AS path,
                project_name AS name,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                created_at,
                last_render_at,
                voice_duration_s,
                sentence_count,
                media_count,
                palette_seed,
                project_mtime,
                last_error
            FROM projects
            ORDER BY last_render_at DESC
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
                project_path AS path,
                project_name AS name,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                created_at,
                last_render_at,
                voice_duration_s,
                sentence_count,
                media_count,
                palette_seed,
                project_mtime,
                last_error
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
                project_path AS path,
                project_name AS name,
                thumbnail_path,
                current_config_hash,
                last_rendered_config_hash,
                has_unrendered_changes,
                created_at,
                last_render_at,
                voice_duration_s,
                sentence_count,
                media_count,
                palette_seed,
                project_mtime,
                last_error
            FROM projects
            WHERE project_path = ?
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
                last_render_at = ?
            WHERE project_path = ? AND current_config_hash IS NOT NULL
            """,
            (now, str(project_path.resolve())),
        )


def remove_recent(path: Path) -> None:
    normalized_path = str(path.resolve())
    with connection() as conn:
        conn.execute("DELETE FROM projects WHERE project_path = ?", (normalized_path,))
