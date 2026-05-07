"""Integration tests for the /align endpoint (T3.3).

Gated on VC_INTEGRATION=1 — requires WhisperX, torch, and a real voice.wav
in tests/fixtures/smoke-project/. Do NOT run in CI.

Usage:
    $env:VC_INTEGRATION = "1"
    python -m pytest apps/server/tests/test_alignment_integration.py -v
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from server.main import app

pytestmark = pytest.mark.skipif(
    os.environ.get("VC_INTEGRATION") != "1",
    reason="Set VC_INTEGRATION=1 to run model integration tests",
)

SMOKE_PROJECT = Path(__file__).parent / "fixtures" / "smoke-project"


@pytest.fixture()
def project(tmp_path: Path) -> Path:
    dest = tmp_path / "smoke"
    shutil.copytree(SMOKE_PROJECT, dest)
    return dest


@pytest.mark.asyncio
async def test_alignment_end_to_end(project: Path) -> None:
    assert (project / "voice.wav").exists(), (
        "Place a real voice.wav in tests/fixtures/smoke-project/ before running."
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.post(f"/projects/align?project={project}")

    assert r.status_code == 200, r.text
    data = r.json()
    assert "sentences" in data
    assert len(data["sentences"]) > 0
    assert all("start_s" in s and "end_s" in s for s in data["sentences"])
    assert data["cache_hit"] is False


@pytest.mark.asyncio
async def test_alignment_cache_hit(project: Path) -> None:
    assert (project / "voice.wav").exists(), (
        "Place a real voice.wav in tests/fixtures/smoke-project/ before running."
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post(f"/projects/align?project={project}")
        assert first.status_code == 200, first.text
        second = await client.post(f"/projects/align?project={project}")

    assert second.status_code == 200
    assert second.json()["cache_hit"] is True


@pytest.mark.asyncio
async def test_alignment_force_reruns(project: Path) -> None:
    assert (project / "voice.wav").exists(), (
        "Place a real voice.wav in tests/fixtures/smoke-project/ before running."
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post(f"/projects/align?project={project}")
        assert first.status_code == 200, first.text
        forced = await client.post(f"/projects/align?project={project}&force=true")

    assert forced.status_code == 200
    assert forced.json()["cache_hit"] is False


@pytest.mark.asyncio
async def test_alignment_transcript_change_invalidates_cache(project: Path) -> None:
    assert (project / "voice.wav").exists(), (
        "Place a real voice.wav in tests/fixtures/smoke-project/ before running."
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        first = await client.post(f"/projects/align?project={project}")
        assert first.status_code == 200, first.text

    (project / "transcript.txt").write_text("Changed transcript content.", encoding="utf-8")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        second = await client.post(f"/projects/align?project={project}")

    assert second.status_code == 200
    assert second.json()["cache_hit"] is False
