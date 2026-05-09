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
    output_path: Path | None = None,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?,
                status = ?,
                message = ?,
                output_path = COALESCE(?, output_path)
            WHERE id = ?
            """,
            (
                finished_at.isoformat(),
                "error",
                message,
                str(output_path) if output_path is not None else None,
                render_id,
            ),
        )


def mark_render_cancelled(
    *,
    render_id: str,
    finished_at: datetime,
    message: str,
    output_path: Path | None = None,
) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?,
                status = ?,
                message = ?,
                output_path = COALESCE(?, output_path)
            WHERE id = ?
            """,
            (
                finished_at.isoformat(),
                "cancelled",
                message,
                str(output_path) if output_path is not None else None,
                render_id,
            ),
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


def list_renders(limit: int = 50, *, include_excluded: bool = True) -> list[RenderHistoryRow]:
    where = "" if include_excluded else "WHERE status = 'done'"
    with connection() as conn:
        rows = conn.execute(
            f"""
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
            {where}
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_render_for_project(render_id: str, project_path: Path) -> RenderHistoryRow | None:
    with connection() as conn:
        row = conn.execute(
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
            WHERE id = ? AND project_path = ?
            """,
            (render_id, str(project_path.resolve())),
        ).fetchone()
    return dict(row) if row is not None else None


def get_render(render_id: str) -> RenderHistoryRow | None:
    with connection() as conn:
        row = conn.execute(
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
            WHERE id = ?
            """,
            (render_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def delete_render(render_id: str) -> RenderHistoryRow | None:
    row = get_render(render_id)
    if row is None:
        return None
    with connection() as conn:
        conn.execute("DELETE FROM render_history WHERE id = ?", (render_id,))
    return row


def delete_renders(*, include_done: bool = True) -> list[RenderHistoryRow]:
    rows = list_renders(limit=500, include_excluded=True)
    selected = rows if include_done else [row for row in rows if str(row["status"]) != "done"]
    with connection() as conn:
        if include_done:
            conn.execute("DELETE FROM render_history")
        else:
            conn.execute("DELETE FROM render_history WHERE status != 'done'")
    return selected
