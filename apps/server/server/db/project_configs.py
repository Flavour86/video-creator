"""Canonical project config snapshots."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from server.db.app_db import connection
from server.db.projects import get_project_by_path, project_id_for_path
from server.domain.project import Project


def config_hash(config: dict[str, Any]) -> str:
    canonical = json.dumps(config, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def save_config_snapshot(project_dir: Path, config: dict[str, Any]) -> str:
    validated = Project.model_validate(config)
    data = validated.model_dump(mode="json", by_alias=True, exclude_none=False)
    digest = config_hash(data)
    normalized_path = str(project_dir.resolve())
    existing = get_project_by_path(project_dir)
    project_id = str(existing["project_id"]) if existing is not None else data.get("project_id")
    project_id = project_id or project_id_for_path(project_dir)
    now = datetime.now(UTC).isoformat()

    with connection() as conn:
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
                updated_at = excluded.updated_at
            """,
            (project_id, normalized_path, validated.name, now, now, now),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO project_configs (project_id, config_hash, config_json, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (project_id, digest, json.dumps(data, sort_keys=True), now),
        )
        conn.execute(
            """
            UPDATE projects
            SET current_config_hash = ?,
                has_unrendered_changes = CASE
                    WHEN last_rendered_config_hash = ? THEN 0
                    ELSE 1
                END,
                updated_at = ?
            WHERE project_id = ?
            """,
            (digest, digest, now, project_id),
        )
    return digest


def latest_config_for_project_path(project_dir: Path) -> dict[str, Any] | None:
    existing = get_project_by_path(project_dir)
    project_id = str(existing["project_id"]) if existing is not None else project_id_for_path(project_dir)
    with connection() as conn:
        row = conn.execute(
            """
            SELECT config_json
            FROM project_configs
            WHERE project_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (project_id,),
        ).fetchone()
    if row is None:
        return None
    return json.loads(str(row["config_json"]))
