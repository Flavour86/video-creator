"""Render-history CRUD."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from server.db.app_db import connection
from server.db.projects import get_project_by_path, mark_project_rendered, project_id_for_path

RenderHistoryRow = dict[str, object]
RenderArtifactRow = dict[str, str | int | None]
RenderEventRow = dict[str, str | float | int | None]


def insert_render(
    *,
    render_id: str,
    project_path: Path,
    output_path: Path,
    preset: str,
    started_at: datetime,
    resolution: str,
    width: int,
    height: int,
    video_codec: str | None = "libx264",
    video_crf: int | None = None,
    video_preset: str | None = None,
    audio_codec: str | None = "aac",
    audio_bitrate_kbps: int | None = None,
    audio_sample_rate: int | None = 48000,
    pixel_format: str | None = "yuv420p",
    color_space: str | None = None,
) -> None:
    normalized_project_path = str(project_path.resolve())
    with connection() as conn:
        project_row = conn.execute(
            "SELECT project_id, current_config_hash FROM projects WHERE project_path = ?",
            (normalized_project_path,),
        ).fetchone()
        now = datetime.now().isoformat()
        if project_row is None:
            project_id = project_id_for_path(project_path)
            conn.execute(
                """
                INSERT INTO projects (
                    project_id,
                    project_path,
                    project_name,
                    created_at,
                    last_render_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(project_path) DO NOTHING
                """,
                (project_id, normalized_project_path, project_path.name, now, now),
            )
            config_hash = None
        else:
            project_id = str(project_row["project_id"])
            config_hash = (
                str(project_row["current_config_hash"])
                if project_row["current_config_hash"] is not None
                else None
            )
        conn.execute(
            """
            INSERT INTO render_history (
                id,
                project_id,
                output_path,
                preset,
                resolution,
                width,
                height,
                started_at,
                status,
                fps,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                config_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                render_id,
                project_id,
                str(output_path),
                preset,
                resolution,
                width,
                height,
                started_at.isoformat(),
                "queued",
                None,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                config_hash,
            ),
        )


def mark_render_finished(
    *,
    render_id: str,
    finished_at: datetime,
    duration_s: float,
    output_path: Path | None = None,
    fps: float | None = None,
    speed: float | None = None,
    frame_count: int | None = None,
) -> None:
    project_path: Path | None = None
    row: Any = None
    resolved_output_path = str(output_path) if output_path is not None else None
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET finished_at = ?,
                duration_s = ?,
                status = ?,
                message = NULL,
                output_path = COALESCE(?, output_path),
                size_bytes = COALESCE(?, size_bytes),
                fps = COALESCE(?, fps),
                speed = COALESCE(?, speed),
                frame_count = COALESCE(?, frame_count),
                updated_at = datetime('now')
            WHERE id = ?
            """,
            # Keep optional ffmpeg stats only when available.
            (
                finished_at.isoformat(),
                duration_s,
                "rendered",
                resolved_output_path,
                (
                    output_path.stat().st_size
                    if output_path is not None and output_path.exists()
                    else None
                ),
                fps,
                speed,
                frame_count,
                render_id,
            ),
        )
        row = conn.execute(
            """
            SELECT p.project_path, rh.output_path, rh.preset, rh.config_hash
            FROM render_history rh
            JOIN projects p ON p.project_id = rh.project_id
            WHERE rh.id = ?
            """,
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
    if project_path is not None:
        mark_project_rendered(
            project_path,
            config_hash=str(row["config_hash"]) if row["config_hash"] is not None else None,
        )
        output_path = Path(str(row["output_path"]))
        add_render_artifact(
            render_id=render_id,
            kind="output",
            path=output_path,
        )


def mark_render_started(*, render_id: str) -> None:
    with connection() as conn:
        conn.execute(
            """
            UPDATE render_history
            SET status = ?,
                message = NULL,
                updated_at = datetime('now')
            WHERE id = ? AND status = ?
            """,
            ("rendering", render_id, "queued"),
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
                output_path = COALESCE(?, output_path),
                updated_at = datetime('now')
            WHERE id = ?
            """,
            (
                finished_at.isoformat(),
                "failed",
                message,
                str(output_path) if output_path is not None else None,
                render_id,
            ),
        )
        row = conn.execute(
            """
            SELECT p.project_path, rh.output_path
            FROM render_history rh
            JOIN projects p ON p.project_id = rh.project_id
            WHERE rh.id = ?
            """,
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
            if artifact_path is None:
                artifact_path = Path(str(row["output_path"]))
    if project_path is not None and artifact_path is not None and artifact_path.exists():
        add_render_artifact(
            render_id=render_id,
            kind="partial",
            path=artifact_path,
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
                output_path = COALESCE(?, output_path),
                updated_at = datetime('now')
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
            """
            SELECT p.project_path, rh.output_path
            FROM render_history rh
            JOIN projects p ON p.project_id = rh.project_id
            WHERE rh.id = ?
            """,
            (render_id,),
        ).fetchone()
        if row is not None:
            project_path = Path(str(row["project_path"]))
            if artifact_path is None:
                artifact_path = Path(str(row["output_path"]))
    if project_path is not None and artifact_path is not None and artifact_path.exists():
        add_render_artifact(
            render_id=render_id,
            kind="partial",
            path=artifact_path,
        )


def add_render_artifact(
    *,
    render_id: str,
    kind: str,
    path: Path,
    size_bytes: int | None = None,
) -> int:
    canonical_kind = _canonical_artifact_kind(kind)
    if canonical_kind is None:
        raise ValueError(f"Unsupported render artifact kind: {kind}")
    resolved_path = path.resolve()
    stored_size = (
        size_bytes
        if size_bytes is not None
        else (resolved_path.stat().st_size if resolved_path.is_file() else None)
    )
    with connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO render_artifacts (
                render_id,
                kind,
                path,
                size_bytes
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                render_id,
                canonical_kind,
                str(resolved_path),
                stored_size,
            ),
        )
    artifact_id = cursor.lastrowid
    if artifact_id is None:
        raise RuntimeError("Failed to persist render artifact.")
    return artifact_id


def list_render_artifacts(render_id: str) -> list[RenderArtifactRow]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                render_id,
                kind,
                path,
                size_bytes,
                created_at
            FROM render_artifacts
            WHERE render_id = ?
            ORDER BY id
            """,
            (render_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def add_render_event(
    *,
    render_id: str,
    phase: str,
    message: str | None = None,
    progress: float | None = None,
    detail_json: dict[str, Any] | str | None = None,
) -> None:
    serialized_detail: str | None = None
    if detail_json is not None:
        if isinstance(detail_json, str):
            serialized_detail = detail_json
        else:
            serialized_detail = json.dumps(detail_json, separators=(",", ":"), sort_keys=True)
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO render_events (render_id, phase, progress, message, detail_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (render_id, phase, progress, message, serialized_detail),
        )


def list_render_events(render_id: str) -> list[RenderEventRow]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, render_id, ts, phase, progress, message, detail_json
            FROM render_events
            WHERE render_id = ?
            ORDER BY id
            """,
            (render_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_latest_render_event(render_id: str) -> RenderEventRow | None:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, render_id, ts, phase, progress, message, detail_json
            FROM render_events
            WHERE render_id = ?
            ORDER BY id DESC, ts DESC
            LIMIT 1
            """,
            (render_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def list_renders_for_project(project_path: Path, limit: int = 10) -> list[RenderHistoryRow]:
    project = get_project_by_path(project_path)
    if project is None:
        return []
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                project_id,
                output_path,
                preset,
                resolution,
                width,
                height,
                started_at,
                finished_at,
                duration_s,
                fps,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                size_bytes,
                speed,
                frame_count,
                config_hash,
                status,
                message,
                excluded
            FROM render_history
            WHERE project_id = ?
            ORDER BY
                CASE status
                    WHEN 'rendering' THEN 0
                    WHEN 'queued' THEN 1
                    ELSE 2
                END,
                CASE
                    WHEN status IN ('rendering', 'queued') THEN started_at
                    ELSE NULL
                END ASC,
                started_at DESC
            LIMIT ?
            """,
            (str(project["project_id"]), limit),
        ).fetchall()
    return [dict(row) for row in rows]


def list_renders(limit: int = 50, *, include_excluded: bool = True) -> list[RenderHistoryRow]:
    where = "" if include_excluded else "WHERE excluded = 0"
    with connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                id,
                project_id,
                output_path,
                preset,
                resolution,
                width,
                height,
                started_at,
                finished_at,
                duration_s,
                fps,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                size_bytes,
                speed,
                frame_count,
                config_hash,
                status,
                message,
                excluded
            FROM render_history
            {where}
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_render_for_project(render_id: str, project_path: Path) -> RenderHistoryRow | None:
    project = get_project_by_path(project_path)
    if project is None:
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT
                id,
                project_id,
                output_path,
                preset,
                resolution,
                width,
                height,
                started_at,
                finished_at,
                duration_s,
                fps,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                size_bytes,
                speed,
                frame_count,
                config_hash,
                status,
                message,
                excluded
            FROM render_history
            WHERE id = ? AND project_id = ?
            """,
            (render_id, str(project["project_id"])),
        ).fetchone()
    return dict(row) if row is not None else None


def get_render(render_id: str) -> RenderHistoryRow | None:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT
                id,
                project_id,
                output_path,
                preset,
                resolution,
                width,
                height,
                started_at,
                finished_at,
                duration_s,
                fps,
                video_codec,
                video_crf,
                video_preset,
                audio_codec,
                audio_bitrate_kbps,
                audio_sample_rate,
                pixel_format,
                color_space,
                size_bytes,
                speed,
                frame_count,
                config_hash,
                status,
                message,
                excluded
            FROM render_history
            WHERE id = ?
            """,
            (render_id,),
        ).fetchone()
    return dict(row) if row is not None else None


def get_render_project_id(render_id: str) -> str | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT project_id FROM render_history WHERE id = ?",
            (render_id,),
        ).fetchone()
    if row is None or row["project_id"] is None:
        return None
    return str(row["project_id"])


def render_belongs_to_project(*, render_id: str, project_id: str) -> bool:
    with connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM render_history WHERE id = ? AND project_id = ?",
            (render_id, project_id),
        ).fetchone()
    return row is not None


def delete_render(render_id: str) -> RenderHistoryRow | None:
    row = get_render(render_id)
    if row is None:
        return None
    project_path: Path | None = None
    project_id = row.get("project_id")
    if project_id is not None:
        with connection() as conn:
            project_row = conn.execute(
                "SELECT project_path FROM projects WHERE project_id = ?",
                (str(project_id),),
            ).fetchone()
        if project_row is not None:
            project_path = Path(str(project_row["project_path"]))
    artifacts = list_render_artifacts(render_id)
    with connection() as conn:
        conn.execute("DELETE FROM render_events WHERE render_id = ?", (render_id,))
        conn.execute("DELETE FROM render_artifacts WHERE render_id = ?", (render_id,))
        conn.execute("DELETE FROM render_history WHERE id = ?", (render_id,))
    if project_path is not None:
        for artifact in artifacts:
            _delete_generated_file(Path(str(artifact["path"])), project_path)
    return row


def delete_renders(*, include_done: bool = True) -> list[RenderHistoryRow]:
    rows = list_renders(limit=500, include_excluded=True)
    selected = rows if include_done else [row for row in rows if str(row["status"]) != "rendered"]
    for row in selected:
        delete_render(str(row["id"]))
    return selected


def _canonical_artifact_kind(kind: str) -> str | None:
    mapping = {
        "output": "output",
        "draft_mp4": "output",
        "final_mp4": "output",
        "partial": "partial",
        "log": "log",
        "logs": "log",
        "graph": "graph",
        "filtergraph": "graph",
        "subtitles": "subtitles",
        "subtitle": "subtitles",
        "srt": "subtitles",
        "thumbnail": "thumbnail",
        "thumb": "thumbnail",
    }
    return mapping.get(kind)


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
