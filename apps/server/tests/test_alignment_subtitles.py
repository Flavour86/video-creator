from __future__ import annotations

import json
import math
import wave
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


def _write_wav(path: Path, *, duration_s: float = 1.0, sample_rate: int = 16_000) -> None:
    frames = max(1, int(duration_s * sample_rate))
    amplitude = 0
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        pcm = bytearray()
        for _ in range(frames):
            sample = int(amplitude * math.sin(0.0))
            pcm.extend(sample.to_bytes(2, byteorder="little", signed=True))
        wav.writeframes(bytes(pcm))


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
    assert (tmp_path / "subtitles.srt").read_bytes() == (
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
        (tmp_path / "subtitles.srt").unlink()

        second = await client.post("/projects/align", params={"project": str(tmp_path)})

    assert second.status_code == 200
    assert second.json()["cache_hit"] is True
    assert (tmp_path / "subtitles.srt").is_file()


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_reports_corrections(monkeypatch, tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.5)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    async def fake_align(*_args, **_kwargs) -> AlignmentResult:
        return AlignmentResult(
            sentences=[
                AlignedSentence(
                    index=1,
                    text="Hello brave world.",
                    start_s=0.0,
                    end_s=1.4,
                    confidence_avg=0.9,
                )
            ],
            words=[
                AlignedWord(sentence_index=1, text="Hello", start_s=0.0, end_s=0.3, confidence=0.9),
                AlignedWord(sentence_index=1, text="brave", start_s=0.3, end_s=0.7, confidence=0.9),
                AlignedWord(sentence_index=1, text="world.", start_s=0.7, end_s=1.4, confidence=0.9),
            ],
        )

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-corrections"),
                "name": "Alignment Corrections",
                "output_preset": "draft",
            },
        )
        assert create.status_code == 200
        setup_id = create.json()["setup_id"]

        upload_voice = await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        assert upload_voice.status_code == 200
        upload_transcript = await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        assert upload_transcript.status_code == 200

        subtitle = await client.post("/subtitle", json={"setup_id": setup_id})
        assert subtitle.status_code == 200
        align = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert align.status_code == 200
    payload = align.json()
    assert payload["status"] == "succeeded"
    assert payload["alignment"]["status"] == "aligned"
    assert payload["corrections_applied"] >= 1


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_cuda_oom_falls_back_to_cpu(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    calls: list[str | None] = []

    async def fake_align(*_args, **kwargs) -> AlignmentResult:
        calls.append(kwargs.get("device"))
        if len(calls) == 1:
            raise RuntimeError("CUDA out of memory")
        return _alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-cuda-fallback"),
                "name": "CUDA Fallback",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert response.json()["alignment"]["device"] == "cpu fp32"
    assert calls == [None, "cpu"]


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_reports_ready_when_prereqs_missing(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-prereq"),
                "name": "Prereq Missing",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["error_code"] == "VOICE_NOT_SELECTED"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_surfaces_recoverable_mismatch_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    async def fake_align(*_args, **_kwargs) -> AlignmentResult:
        return AlignmentResult(sentences=[], words=[])

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-mismatch"),
                "name": "Mismatch",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error_code"] == "LONG_SILENCE"
    assert payload["alignment"]["status"] == "failed"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_surfaces_low_confidence_mismatch_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    async def fake_align(*_args, **_kwargs) -> AlignmentResult:
        return AlignmentResult(
            sentences=[
                AlignedSentence(
                    index=1,
                    text="Hello world.",
                    start_s=0.0,
                    end_s=1.0,
                    confidence_avg=0.1,
                )
            ],
            words=[
                AlignedWord(sentence_index=1, text="Hello", start_s=0.0, end_s=0.4, confidence=0.2),
                AlignedWord(sentence_index=1, text="world.", start_s=0.4, end_s=1.0, confidence=0.2),
            ],
        )

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-low-confidence"),
                "name": "Low Confidence",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error_code"] == "MISMATCHED_TEXT"
    assert payload["alignment"]["status"] == "failed"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_reports_ready_when_transcript_missing(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    _write_wav(voice_source, duration_s=1.0)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-transcript-missing"),
                "name": "Transcript Missing",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["error_code"] == "TRANSCRIPT_NOT_SELECTED"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_fails_when_transcript_empty(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text(" ", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-transcript-empty"),
                "name": "Transcript Empty",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error_code"] == "TRANSCRIPT_EMPTY"
    assert payload["alignment"]["status"] == "failed"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_cache_hit_and_transcript_change_invalidation(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    transcript_source_changed = tmp_path / "transcript-2.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")
    transcript_source_changed.write_text("Hello changed world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    align_calls = 0

    async def fake_align(*_args, **_kwargs) -> AlignmentResult:
        nonlocal align_calls
        align_calls += 1
        return _alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-cache"),
                "name": "Alignment Cache",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        first = await client.post("/subtitle/alignment", json={"setup_id": setup_id})
        second = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript-2.txt", transcript_source_changed.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        third = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert first.status_code == 200
    assert first.json()["status"] == "succeeded"
    assert first.json()["alignment"]["cache_hit"] is False
    assert second.status_code == 200
    assert second.json()["status"] == "succeeded"
    assert second.json()["alignment"]["cache_hit"] is True
    assert third.status_code == 200
    assert third.json()["status"] == "succeeded"
    assert third.json()["alignment"]["cache_hit"] is False
    assert align_calls == 2


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_surfaces_whisperx_unavailable_error(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    async def fake_align(*_args, **_kwargs) -> AlignmentResult:
        raise ModuleNotFoundError("whisperx")

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-whisperx-missing"),
                "name": "WhisperX Missing",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "failed"
    assert payload["error_code"] == "WHISPERX_UNAVAILABLE"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_falls_back_to_cpu_when_cuda_unavailable(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=1.0)
    transcript_source.write_text("Hello world.", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _alignment()

    calls: list[str | None] = []

    async def fake_align(*_args, **kwargs) -> AlignmentResult:
        calls.append(kwargs.get("device"))
        if len(calls) == 1:
            raise RuntimeError("CUDA unavailable: no device")
        return _alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", fake_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "alignment-cuda-unavailable"),
                "name": "CUDA Unavailable",
                "output_preset": "draft",
            },
        )
        setup_id = create.json()["setup_id"]
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/voice",
            files={"file": ("voice.wav", voice_source.read_bytes(), "audio/wav")},
        )
        await client.post(
            f"/setup/drafts/{setup_id}/artifacts/transcript",
            files={"file": ("transcript.txt", transcript_source.read_bytes(), "text/plain")},
        )
        await client.post("/subtitle", json={"setup_id": setup_id})
        response = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert response.status_code == 200
    assert response.json()["status"] == "succeeded"
    assert response.json()["alignment"]["device"] == "cpu fp32"
    assert calls == [None, "cpu"]
