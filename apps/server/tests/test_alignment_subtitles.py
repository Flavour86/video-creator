from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult
from server.main import app
from server.pipeline import transcribe


def _write_project(project_dir: Path) -> None:
    project_dir.mkdir(exist_ok=True)
    (project_dir / "voice.wav").write_bytes(b"wav")
    (project_dir / "transcript.txt").write_text("Hello world.", encoding="utf-8")
    (project_dir / "project.json").write_text(
        json.dumps(
            {
                "version": 1,
                "name": "test",
                "audio": "voice.wav",
                "transcript": {"kind": "plain_text", "path": "transcript.txt"},
                "output": {"preset": "draft"},
                "layers": [],
                "subtitles": None,
                "watermark": None,
            }
        ),
        encoding="utf-8",
    )


def _alignment() -> AlignmentResult:
    return AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text="Hello world.",
                start_s=0.0,
                end_s=1.2,
                confidence_avg=0.95,
            )
        ],
        words=[
            AlignedWord(sentence_index=1, text="Hello", start_s=0.0, end_s=0.5, confidence=0.9),
            AlignedWord(sentence_index=1, text="world.", start_s=0.5, end_s=1.2, confidence=0.9),
        ],
    )


@pytest.mark.asyncio
async def test_alignment_endpoint_writes_subtitles(monkeypatch, tmp_path: Path) -> None:
    _write_project(tmp_path)

    async def fake_align(*args, **kwargs) -> AlignmentResult:
        return _alignment()

    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects/align", params={"project": str(tmp_path)})

    assert response.status_code == 200
    assert (tmp_path / ".vc" / "subtitles.srt").read_bytes() == (
        b"1\r\n00:00:00,000 --> 00:00:01,200\r\nHello world.\r\n"
    )


@pytest.mark.asyncio
async def test_alignment_cache_hit_regenerates_missing_subtitles(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _write_project(tmp_path)

    async def fake_align(*args, **kwargs) -> AlignmentResult:
        return _alignment()

    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/projects/align", params={"project": str(tmp_path)})
        assert first.status_code == 200
        (tmp_path / ".vc" / "subtitles.srt").unlink()

        second = await client.post("/projects/align", params={"project": str(tmp_path)})

    assert second.status_code == 200
    assert second.json()["cache_hit"] is True
    assert (tmp_path / ".vc" / "subtitles.srt").is_file()
