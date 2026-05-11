"""Render-history CRUD."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any

from server.db.app_db import connection
from server.db.projects import get_project_by_path, mark_project_rendered, project_id_for_path

RenderHistoryRow = dict[str, str | float | None]
RenderArtifactRow = dict[str, str | int | None]
RenderEventRow = dict[str, str | float | None]


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
    project_path: Path | None = None
    row: Any = None
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?, duration_s = ?, status = ?, message = NULL
            WHERE id = ?
            """,
            (finished_at.isoformat(), duration_s, "done", render_id),
        )
        row = conn.execute(
            "SELECT project_path, output_path, preset FROM render_history WHERE id = ?",
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
    if project_path is not None:
        mark_project_rendered(project_path)
        output_path = Path(str(row["output_path"]))
        add_render_artifact(
            render_id=render_id,
            project_path=project_path,
            kind="draft_mp4" if str(row["preset"]) == "draft" else "final_mp4",
            path=output_path,
            playable=output_path.is_file(),
            reusable=True,
        )


def mark_render_failed(
    *,
    render_id: str,
    finished_at: datetime,
    message: str,
    output_path: Path | None = None,
) -> None:
    project_path: Path | None = None
    artifact_path = output_path
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
        row = conn.execute(
            "SELECT project_path, output_path FROM render_history WHERE id = ?",
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
            if artifact_path is None:
                artifact_path = Path(str(row["output_path"]))
    if project_path is not None and artifact_path is not None and artifact_path.exists():
        add_render_artifact(
            render_id=render_id,
            project_path=project_path,
            kind="partial",
            path=artifact_path,
            playable=False,
            reusable=False,
        )


def mark_render_cancelled(
    *,
    render_id: str,
    finished_at: datetime,
    message: str,
    output_path: Path | None = None,
) -> None:
    project_path: Path | None = None
    artifact_path = output_path
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
        row = conn.execute(
            "SELECT project_path, output_path FROM render_history WHERE id = ?",
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
            if artifact_path is None:
                artifact_path = Path(str(row["output_path"]))
    if project_path is not None and artifact_path is not None and artifact_path.exists():
        add_render_artifact(
            render_id=render_id,
            project_path=project_path,
            kind="partial",
            path=artifact_path,
            playable=False,
            reusable=False,
        )


def add_render_artifact(
    *,
    render_id: str,
    project_path: Path,
    kind: str,
    path: Path,
    playable: bool,
    reusable: bool,
) -> str:
    artifact_id = f"a_{secrets.token_hex(12)}"
    resolved_path = path.resolve()
    project = get_project_by_path(project_path)
    project_id = str(project["project_id"]) if project is not None else project_id_for_path(project_path)
    size = resolved_path.stat().st_size if resolved_path.is_file() else None
    digest = _file_hash(resolved_path) if resolved_path.is_file() else None
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO render_artifacts (
                artifact_id,
                render_id,
                project_id,
                kind,
                path,
                size,
                hash,
                playable,
                reusable
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                artifact_id,
                render_id,
                project_id,
                kind,
                str(resolved_path),
                size,
                digest,
                int(playable),
                int(reusable),
            ),
        )
    return artifact_id


def list_render_artifacts(render_id: str) -> list[RenderArtifactRow]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT artifact_id, render_id, project_id, kind, path, size, hash, created_at, playable, reusable
            FROM render_artifacts
            WHERE render_id = ?
            ORDER BY created_at, artifact_id
            """,
            (render_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_render_event(
    *,
    render_id: str,
    project_path: Path,
    stage: str,
    status: str,
    message: str | None = None,
    progress: float | None = None,
) -> None:
    project = get_project_by_path(project_path)
    project_id = str(project["project_id"]) if project is not None else project_id_for_path(project_path)
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO render_events (render_id, project_id, stage, status, message, progress)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (render_id, project_id, stage, status, message, progress),
        )


def list_render_events(render_id: str) -> list[RenderEventRow]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT render_id, project_id, stage, status, message, progress, created_at
            FROM render_events
            WHERE render_id = ?
            ORDER BY id
            """,
            (render_id,),
        ).fetchall()
    return [dict(row) for row in rows]


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
    artifacts = list_render_artifacts(render_id)
    with connection() as conn:
        conn.execute("DELETE FROM render_events WHERE render_id = ?", (render_id,))
        conn.execute("DELETE FROM render_artifacts WHERE render_id = ?", (render_id,))
        conn.execute("DELETE FROM render_history WHERE id = ?", (render_id,))
    for artifact in artifacts:
        _delete_generated_file(Path(str(artifact["path"])), Path(str(row["project_path"])))
    return row


def delete_renders(*, include_done: bool = True) -> list[RenderHistoryRow]:
    rows = list_renders(limit=500, include_excluded=True)
    selected = rows if include_done else [row for row in rows if str(row["status"]) != "done"]
    for row in selected:
        delete_render(str(row["id"]))
    return selected


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def _delete_generated_file(path: Path, project_path: Path) -> None:
    try:
        resolved_path = path.resolve()
        project_dir = project_path.resolve()
    except OSError:
        return
    generated_roots = [project_dir / ".vc", project_dir / "renders"]
    if not any(resolved_path == root or root in resolved_path.parents for root in generated_roots):
        return
    try:
        if resolved_path.is_file():
            resolved_path.unlink()
    except OSError:
        return
