"""Global application SQLite DB."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from server.db.migrations import run_migrations
from server.settings import settings


def init_db(path: Path | None = None) -> None:
    db_path = path or settings.app_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        run_migrations(conn)


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    init_db()
    conn = sqlite3.connect(settings.app_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
