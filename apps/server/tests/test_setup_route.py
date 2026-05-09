import struct
import wave
from pathlib import Path

import httpx
import pytest

from server.main import app


def _write_wav(path: Path) -> None:
    sample_rate = 48000
    sample_count = sample_rate
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack(f"<{sample_count * 2}h", *([0] * sample_count * 2)))


@pytest.mark.asyncio
async def test_setup_scaffold_rejects_non_empty_folder(tmp_path: Path) -> None:
    target = tmp_path / "project"
    target.mkdir()
    (target / "existing.txt").write_text("x", encoding="utf-8")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/setup/scaffold",
            json={"path": str(target), "name": "Demo"},
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "NOT_EMPTY"


@pytest.mark.asyncio
async def test_setup_inspect_populates_metadata_and_hash(tmp_path: Path) -> None:
    (tmp_path / "transcript.txt").write_text("First sentence. Second sentence.", encoding="utf-8")
    _write_wav(tmp_path / "voice.wav")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/setup/inspect", params={"path": str(tmp_path)})

    assert response.status_code == 200
    payload = response.json()
    assert payload["voice"]["sample_rate"] == 48000
    assert payload["voice"]["channels"] == 2
    assert payload["transcript"]["sentence_count"] == 2
    assert len(payload["alignment"]["hash"]) == 64
