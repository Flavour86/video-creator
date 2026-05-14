from __future__ import annotations

import ast
import subprocess
from pathlib import Path

import httpx
import pytest

from server.db.app_db import AppDatabaseError
from server.main import app
from server.routes import projects

REPO_ROOT = Path(__file__).resolve().parents[3]
SERVER_ROOT = REPO_ROOT / "apps" / "server" / "server"
SQL_METHODS = {"execute", "executemany", "executescript"}


def _is_interpolated_sql(node: ast.AST) -> bool:
    if isinstance(node, ast.JoinedStr):
        for value in node.values:
            if isinstance(value, ast.Constant):
                continue
            if (
                isinstance(value, ast.FormattedValue)
                and isinstance(value.value, ast.Name)
                and value.value.id == "where"
            ):
                continue
            return True
        return False
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return True
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr == "format"
    return False


def test_sql_calls_do_not_use_interpolated_query_strings() -> None:
    offenders: list[str] = []
    for path in sorted(SERVER_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in SQL_METHODS or not node.args:
                continue
            if _is_interpolated_sql(node.args[0]):
                rel = path.relative_to(REPO_ROOT)
                offenders.append(f"{rel}:{node.lineno}")

    assert not offenders, "Interpolated SQL found in execute calls:\n" + "\n".join(offenders)


def test_generated_schema_outputs_are_in_sync() -> None:
    result = subprocess.run(
        ["node", "scripts/check-generated-schemas.mjs"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.asyncio
async def test_projects_endpoint_hides_raw_app_db_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise_db_error(*, limit: int = 20) -> list[dict[str, object]]:
        _ = limit
        raise AppDatabaseError("database disk image is malformed")

    monkeypatch.setattr(projects, "list_projects", _raise_db_error)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/projects")

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "APP_DB_UNAVAILABLE"
    assert "malformed" not in body["error"]["message"].lower()
    assert "sqlite" not in body["error"]["message"].lower()
