"""Tests for GET /projects/audio — written before implementation (TDD)."""
from __future__ import annotations

import wave
import struct
from pathlib import Path

import httpx
import pytest
from server.main import app


def _write_wav(path: Path, duration_secs: float = 0.5) -> None:
    """Write a minimal valid WAV file."""
    sample_rate = 16000
    n_samples = int(sample_rate * duration_secs)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *([0] * n_samples)))


@pytest.mark.asyncio
async def test_audio_returns_wav(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')
    wav = tmp_path / "voice.wav"
    _write_wav(wav)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/audio", params={"project": str(tmp_path), "filename": "voice.wav"})

    assert r.status_code == 200
    assert "audio" in r.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_audio_missing_file_returns_404(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/projects/audio", params={"project": str(tmp_path), "filename": "voice.wav"})

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_audio_path_traversal_rejected(tmp_path: Path) -> None:
    (tmp_path / "project.json").write_text('{"version":1}')

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(
            "/projects/audio",
            params={"project": str(tmp_path), "filename": "../../etc/passwd"},
        )

    assert r.status_code == 400
