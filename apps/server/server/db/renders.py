"""Render-history CRUD."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from server.db.app_db import connection

RenderHistoryRow = dict[str, str | float | None]


def insert_render(
    *,
    render_id: str,
    project_path: Path,
    output_path: Path,
    preset: str,
    started_at: datetime,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO render_history (
                id,
                project_path,
                output_path,
                preset,
                started_at,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                render_id,
                str(project_path.resolve()),
                str(output_path),
                preset,
                started_at.isoformat(),
                "running",
            ),
        )


def mark_render_finished(
    *,
    render_id: str,
    finished_at: datetime,
    duration_s: float,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?, duration_s = ?, status = ?, message = NULL
            WHERE id = ?
            """,
            (finished_at.isoformat(), duration_s, "done", render_id),
        )


def mark_render_failed(
    *,
    render_id: str,
    finished_at: datetime,
    message: str,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?, status = ?, message = ?
            WHERE id = ?
            """,
            (finished_at.isoformat(), "error", message, render_id),
        )


def list_renders_for_project(project_path: Path, limit: int = 10) -> list[RenderHistoryRow]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                project_path,
                output_path,
                preset,
                started_at,
                finished_at,
                duration_s,
                status,
                message
            FROM render_history
            WHERE project_path = ?
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (str(project_path.resolve()), limit),
        ).fetchall()
    return [dict(row) for row in rows]
