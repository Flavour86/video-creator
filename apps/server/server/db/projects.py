"""Recent-projects CRUD."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from server.db.app_db import connection


def touch_recent(path: Path, name: str) -> None:
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO recent_projects (path, name, last_opened_at)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name = excluded.name,
                last_opened_at = excluded.last_opened_at
            """,
            (str(path.resolve()), name, datetime.now(UTC).isoformat()),
        )


def list_recent(limit: int = 20) -> list[dict[str, str]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT path, name, last_opened_at FROM recent_projects "
            "ORDER BY last_opened_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def remove_recent(path: Path) -> None:
    with connection() as conn:
        conn.execute("DELETE FROM recent_projects WHERE path = ?", (str(path.resolve()),))
