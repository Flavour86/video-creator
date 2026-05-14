from __future__ import annotations

from pathlib import Path

import pytest

from server.settings import settings


@pytest.fixture(autouse=True)
def isolate_app_db(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "app.db")
