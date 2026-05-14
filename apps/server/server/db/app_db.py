"""Global application SQLite DB."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from server.db.migrations import MigrationError, run_migrations
from server.settings import settings

PRAGMA_STATEMENTS = (
    "PRAGMA foreign_keys = ON",
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
    "PRAGMA busy_timeout = 5000",
    "PRAGMA temp_store = MEMORY",
)


class AppDatabaseError(RuntimeError):
    """Public-safe database initialization/connection failure."""


@dataclass(frozen=True)
class InitDbResult:
    warning: str | None = None
    backup_path: Path | None = None


def _configure_connection(conn: sqlite3.Connection) -> None:
    for statement in PRAGMA_STATEMENTS:
        conn.execute(statement)


def _is_corruption_error(exc: sqlite3.DatabaseError) -> bool:
    message = str(exc).lower()
    return "malformed" in message or "not a database" in message


def _backup_corrupt_db(db_path: Path) -> Path:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    backup_path = db_path.with_name(f"{db_path.name}.corrupt.{timestamp}.bak")
    counter = 1
    while backup_path.exists():
        backup_path = db_path.with_name(f"{db_path.name}.corrupt.{timestamp}.{counter}.bak")
        counter += 1
    db_path.rename(backup_path)
    return backup_path


def _migrate(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        _configure_connection(conn)
        run_migrations(conn)
    finally:
        conn.close()


def init_db(path: Path | None = None) -> InitDbResult:
    db_path = path or settings.app_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        _migrate(db_path)
        return InitDbResult()
    except sqlite3.DatabaseError as exc:
        if db_path.exists() and _is_corruption_error(exc):
            backup_path = _backup_corrupt_db(db_path)
            _migrate(db_path)
            warning = f"Recovered corrupted app DB. Backup created at: {backup_path}"
            return InitDbResult(warning=warning, backup_path=backup_path)
        raise AppDatabaseError("Application database is unavailable.") from exc
    except (MigrationError, sqlite3.Error) as exc:
        raise AppDatabaseError("Application database is unavailable.") from exc


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    init_db()
    conn = sqlite3.connect(settings.app_db_path)
    _configure_connection(conn)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
