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
from server.pipeline.cache import alignment_language_for_text, compute_alignment_hash
from server.pipeline.srt import write_transcript_corrected_srt_file
from server.settings import settings


def _write_project(project_dir: Path) -> None:
    project_dir.mkdir(exist_ok=True)
    (project_dir / "voice.wav").write_bytes(b"wav")
    (project_dir / "transcript.txt").write_text("Hello world!", encoding="utf-8")
    (project_dir / "subtitles.srt").write_text(
        _native_srt("Hell0 wurld"),
        encoding="utf-8",
        newline="",
    )
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


def _native_srt(text: str) -> str:
    return f"1\r\n00:00:00,031 --> 00:00:06,819\r\n{text}\r\n"


def _native_alignment(text: str = "Hell0 wurld") -> AlignmentResult:
    return AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text=text,
                start_s=0.031,
                end_s=6.819,
                confidence_avg=0.95,
            )
        ],
        words=[
            AlignedWord(
                sentence_index=1,
                text=text,
                start_s=0.031,
                end_s=6.819,
                confidence=0.9,
            )
        ],
    )


def _timing_lines(srt: str) -> list[str]:
    return [
        block.splitlines()[1]
        for block in srt.replace("\r\n", "\n").strip().split("\n\n")
        if block.strip()
    ]


def test_transcript_correction_preserves_native_srt_timing_and_count(tmp_path: Path) -> None:
    srt_path = tmp_path / "subtitles.srt"
    original = (
        "1\r\n00:00:00,031 --> 00:00:06,819\r\nHell0 wurld\r\n\r\n"
        "2\r\n00:00:06,819 --> 00:00:13,606\r\nExtra ASR only\r\n"
    )
    srt_path.write_text(original, encoding="utf-8", newline="")

    result = write_transcript_corrected_srt_file(
        srt_path,
        "Hello world! This transcript sentence is not allowed to be inserted.",
    )

    corrected = srt_path.read_text(encoding="utf-8")
    assert _timing_lines(corrected) == _timing_lines(original)
    assert result.update.cue_count == 2
    assert "Hello world" in corrected
    assert "!" not in corrected
    assert "This transcript sentence" not in corrected
    assert "Extra ASR only" in corrected


def test_transcript_correction_keeps_native_text_when_change_is_not_low_risk(
    tmp_path: Path,
) -> None:
    srt_path = tmp_path / "subtitles.srt"
    srt_path.write_text(
        _native_srt("prefix QQQQ suffix"),
        encoding="utf-8",
        newline="",
    )

    write_transcript_corrected_srt_file(
        srt_path,
        "prefix ZZZZ suffix",
    )

    corrected = srt_path.read_text(encoding="utf-8")
    assert "prefix QQQQ suffix" in corrected
    assert "ZZZZ" not in corrected


@pytest.mark.asyncio
async def test_alignment_endpoint_corrects_existing_subtitles_without_retiming(
    monkeypatch,
    tmp_path: Path,
) -> None:
    _write_project(tmp_path)
    original = (tmp_path / "subtitles.srt").read_text(encoding="utf-8")

    async def forbidden_align(*_args, **_kwargs) -> AlignmentResult:
        raise AssertionError("Alignment must not run forced audio retiming")

    monkeypatch.setattr(transcribe, "align", forbidden_align)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/projects/align", params={"project": str(tmp_path)})

    assert response.status_code == 200
    corrected = (tmp_path / "subtitles.srt").read_text(encoding="utf-8")
    assert _timing_lines(corrected) == _timing_lines(original)
    assert "Hello world" in corrected
    assert "!" not in corrected
    assert response.json()["sentences"][0]["start_s"] == pytest.approx(0.031)
    assert response.json()["sentences"][0]["end_s"] == pytest.approx(6.819)


@pytest.mark.asyncio
async def test_alignment_cache_hit_requires_existing_native_subtitles(tmp_path: Path) -> None:
    _write_project(tmp_path)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post("/projects/align", params={"project": str(tmp_path)})
        assert first.status_code == 200
        (tmp_path / "subtitles.srt").unlink()

        second = await client.post("/projects/align", params={"project": str(tmp_path)})

    assert second.status_code == 404
    assert second.json()["error"]["code"] == "SUBTITLES_NOT_FOUND"


@pytest.mark.asyncio
async def test_setup_subtitle_alignment_corrects_native_srt_without_retiming(
    monkeypatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    transcript_source = tmp_path / "transcript.txt"
    _write_wav(voice_source, duration_s=7.0)
    transcript_source.write_text("Hello world!", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _native_alignment()

    async def forbidden_align(*_args, **_kwargs) -> AlignmentResult:
        raise AssertionError("Setup alignment must not run forced audio retiming")

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)
    monkeypatch.setattr(transcribe, "align", forbidden_align)

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
        setup_dir = settings.app_db_path.parent / "setup-cache" / setup_id / "artifacts"
        original = (setup_dir / "subtitles.srt").read_text(encoding="utf-8")
        align = await client.post("/subtitle/alignment", json={"setup_id": setup_id})

    assert align.status_code == 200
    payload = align.json()
    corrected = (setup_dir / "subtitles.srt").read_text(encoding="utf-8")
    assert payload["status"] == "succeeded"
    assert payload["alignment"]["status"] == "aligned"
    assert payload["corrections_applied"] >= 1
    assert _timing_lines(corrected) == _timing_lines(original)
    assert "Hello world" in corrected
    assert "!" not in corrected


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
async def test_setup_subtitle_alignment_reports_ready_when_transcript_missing(
    tmp_path: Path,
) -> None:
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
        return _native_alignment()

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
    _write_wav(voice_source, duration_s=7.0)
    transcript_source.write_text("Hello world!", encoding="utf-8")
    transcript_source_changed.write_text("Hallo warld!", encoding="utf-8")

    async def fake_transcribe(_audio_path: Path) -> AlignmentResult:
        return _native_alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe)

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
            files={
                "file": (
                    "transcript-2.txt",
                    transcript_source_changed.read_bytes(),
                    "text/plain",
                )
            },
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


def test_alignment_language_detects_chinese_text() -> None:
    assert alignment_language_for_text(
        "\u52b3\u52a8\u8005\u6ca1\u6709\u8bae\u4ef7\u80fd\u529b\u3002"
    ) == "zh"


def test_alignment_hash_includes_detected_chinese_language(tmp_path: Path) -> None:
    audio = tmp_path / "voice.wav"
    audio.write_bytes(b"voice")
    transcript = "\u52b3\u52a8\u8005\u6ca1\u6709\u8bae\u4ef7\u80fd\u529b\u3002"

    assert compute_alignment_hash(audio, transcript) == compute_alignment_hash(
        audio,
        transcript,
        language="zh",
    )
    assert compute_alignment_hash(audio, transcript) != compute_alignment_hash(
        audio,
        transcript,
        language="en",
    )
