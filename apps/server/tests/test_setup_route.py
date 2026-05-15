import json
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


@pytest.mark.asyncio
async def test_setup_inspect_completes_partial_layout_without_overwriting_media(
    tmp_path: Path,
) -> None:
    media_file = tmp_path / "media" / "keep.png"
    media_file.parent.mkdir(parents=True)
    media_file.write_bytes(b"keep")
    (tmp_path / "project.json").write_text(
        '{"version":1,"name":"Demo","audio":"voice.wav","transcript":{"kind":"plain_text","path":"transcript.txt"},"output":{"preset":"draft"},"layers":[],"subtitles":null,"watermark":null}',
        encoding="utf-8",
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/setup/inspect", params={"path": str(tmp_path)})

    assert response.status_code == 200
    assert media_file.read_bytes() == b"keep"
    assert (tmp_path / "media").is_dir()
    assert (tmp_path / "renders").is_dir()
    assert (tmp_path / "voice.wav").is_file()
    assert (tmp_path / "transcript.txt").is_file()
    assert (tmp_path / "subtitles.srt").is_file()
    assert (tmp_path / ".vc" / "alignment.json").is_file()
    assert (tmp_path / ".vc" / "clips").is_dir()
    assert (tmp_path / ".vc" / "drafts").is_dir()
    assert (tmp_path / ".vc" / "thumbs").is_dir()
    assert (tmp_path / ".vc" / "logs").is_dir()


@pytest.mark.asyncio
async def test_setup_scaffold_preserves_vertical_output_intent(tmp_path: Path) -> None:
    project_dir = tmp_path / "vertical-output"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/setup/scaffold",
            json={"path": str(project_dir), "name": "Vertical", "output_preset": "vertical"},
        )

    assert response.status_code == 200
    project_json = json.loads((project_dir / "project.json").read_text(encoding="utf-8"))
    assert project_json["output"]["preset"] == "final"
    assert project_json["output"]["resolution"] == "1080x1920"
    assert project_json["output"]["width"] == 1080
    assert project_json["output"]["height"] == 1920
