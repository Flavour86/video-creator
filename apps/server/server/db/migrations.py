"""SQLite migration runner for the application DB."""

from __future__ import annotations

import hashlib
import sqlite3
from dataclasses import dataclass
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).with_name("migrations")


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str

    @property
    def checksum(self) -> str:
        return hashlib.sha256(self.sql.encode("utf-8")).hexdigest()


def run_migrations(conn: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    applied = {
        int(row["version"] if isinstance(row, sqlite3.Row) else row[0]): (
            row["checksum"] if isinstance(row, sqlite3.Row) else row[2]
        )
        for row in conn.execute("SELECT version, name, checksum FROM schema_migrations")
    }

    for migration in load_migrations(migrations_dir):
        existing_checksum = applied.get(migration.version)
        if existing_checksum is not None:
            if existing_checksum != migration.checksum:
                raise RuntimeError(f"Migration {migration.version} checksum mismatch")
            continue

        with conn:
            conn.executescript(migration.sql)
            conn.execute(
                "INSERT INTO schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
                (migration.version, migration.name, migration.checksum),
            )


def load_migrations(migrations_dir: Path = MIGRATIONS_DIR) -> list[Migration]:
    migrations: list[Migration] = []
    for path in sorted(migrations_dir.glob("*.sql")):
        version_text, _, name = path.stem.partition("_")
        if not version_text.isdigit() or not name:
            raise RuntimeError(f"Invalid migration filename: {path.name}")
        migrations.append(
            Migration(
                version=int(version_text),
                name=name,
                sql=path.read_text(encoding="utf-8"),
            )
        )
    return migrations
