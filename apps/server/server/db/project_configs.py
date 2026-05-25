"""Canonical project config persistence."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from pydantic import ValidationError

from server.db.app_db import connection
from server.db.projects import get_project_by_path, project_id_for_path
from server.domain.project import Project


def config_hash(config: dict[str, Any]) -> str:
    canonical = json.dumps(config, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def save_config_snapshot(project_dir: Path, config: dict[str, Any]) -> str:
    validated = Project.model_validate(config)
    data = validated.model_dump(mode="json", by_alias=True, exclude_none=False)
    canonical_json = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
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
                project_path,
                project_name,
                created_at,
                last_render_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_path) DO UPDATE SET
                project_name = excluded.project_name
            """,
            (project_id, normalized_path, validated.name, now, now),
        )
        conn.execute(
            """
            INSERT INTO project_configs (
                project_id,
                schema_version,
                config_json,
                config_hash,
                saved_at,
                updated_at
            )
            VALUES (?, 1, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
                schema_version = 1,
                config_json = excluded.config_json,
                config_hash = excluded.config_hash,
                saved_at = excluded.saved_at,
                updated_at = excluded.updated_at
            """,
            (project_id, canonical_json, digest, now, now),
        )
        conn.execute(
            """
            UPDATE projects
            SET current_config_hash = ?,
                has_unrendered_changes = CASE
                    WHEN last_rendered_config_hash = ? THEN 0
                    ELSE 1
                END
            WHERE project_id = ?
            """,
            (digest, digest, project_id),
        )
    return digest


def latest_config_for_project_path(project_dir: Path) -> dict[str, Any] | None:
    existing = get_project_by_path(project_dir)
    project_id = (
        str(existing["project_id"])
        if existing is not None
        else project_id_for_path(project_dir)
    )
    with connection() as conn:
        row = conn.execute(
            """
            SELECT config_json
            FROM project_configs
            WHERE project_id = ?
            LIMIT 1
            """,
            (project_id,),
        ).fetchone()
    if row is None:
        return None
    loaded = json.loads(str(row["config_json"]))
    if not isinstance(loaded, dict):
        return None
    return cast(dict[str, Any], loaded)


def has_valid_config_for_project_id(project_id: str) -> bool:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT config_json
            FROM project_configs
            WHERE project_id = ?
            LIMIT 1
            """,
            (project_id,),
        ).fetchone()
    if row is None:
        return False
    try:
        loaded = json.loads(str(row["config_json"]))
    except (json.JSONDecodeError, TypeError, ValueError):
        return False
    if not isinstance(loaded, dict):
        return False
    try:
        Project.model_validate(loaded)
    except ValidationError:
        return False
    return True
