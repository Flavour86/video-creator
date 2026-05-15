import json
import struct
import wave
from pathlib import Path

import httpx
import pytest

from server.db.app_db import connection
from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult
from server.main import app
from server.pipeline import transcribe
from server.settings import settings


def _write_wav(path: Path) -> None:
    sample_rate = 48000
    sample_count = sample_rate
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack(f"<{sample_count * 2}h", *([0] * sample_count * 2)))


def _subtitle_alignment() -> AlignmentResult:
    return AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text="Hello world.",
                start_s=0.0,
                end_s=1.0,
                confidence_avg=0.95,
            )
        ],
        words=[
            AlignedWord(sentence_index=1, text="Hello", start_s=0.0, end_s=0.5, confidence=0.9),
            AlignedWord(sentence_index=1, text="world.", start_s=0.5, end_s=1.0, confidence=0.9),
        ],
    )


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


@pytest.mark.asyncio
async def test_setup_draft_stages_artifacts_without_creating_final_project(tmp_path: Path) -> None:
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    voice_source = source_dir / "voice.wav"
    transcript_source = source_dir / "transcript.txt"
    watermark_source = source_dir / "watermark.png"
    subtitles_source = source_dir / "subtitles.srt"
    _write_wav(voice_source)
    transcript_source.write_text("First sentence. Second sentence.", encoding="utf-8")
    watermark_source.write_bytes(b"wm")
    subtitles_source.write_text(
        "1\n00:00:00,000 --> 00:00:01,000\nFirst sentence.\n",
        encoding="utf-8",
    )
    final_project_dir = tmp_path / "projects" / "future-project"
    final_project_dir.parent.mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(final_project_dir),
                "name": "Future Project",
                "output_preset": "vertical",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        update_response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={
                "voice_path": str(voice_source),
                "transcript_path": str(transcript_source),
                "watermark_path": str(watermark_source),
                "subtitles_path": str(subtitles_source),
                "subtitle_generation": {
                    "status": "succeeded",
                    "cue_count": 1,
                    "total_duration_s": 1.0,
                    "cache_state": "miss",
                    "error_message": None,
                },
                "alignment": {
                    "status": "aligned",
                    "hash": "abc123",
                    "device": "cpu fp32",
                    "model": "large-v3",
                    "audio_duration": 1.0,
                    "cache_hit": False,
                    "error": None,
                },
                "alignment_result": {"corrections": 1},
            },
        )
        assert update_response.status_code == 200

        draft_response = await client.get(f"/setup/drafts/{setup_id}")
        assert draft_response.status_code == 200
        draft_payload = draft_response.json()

        recent_response = await client.get("/projects/recent")
        assert recent_response.status_code == 200

    assert final_project_dir.exists() is False
    assert draft_payload["draft"]["name"] == "Future Project"
    assert draft_payload["draft"]["output_preset"] == "vertical"
    assert draft_payload["draft"]["voice"]["state"] == "copied"
    assert draft_payload["draft"]["transcript"]["state"] == "parsed"
    assert draft_payload["draft"]["subtitle_generation"]["status"] == "succeeded"
    assert draft_payload["draft"]["alignment"]["status"] == "aligned"

    cache_root = settings.app_db_path.parent / "setup-cache"
    staged_voice = Path(draft_payload["artifacts"]["voice_path"])
    staged_transcript = Path(draft_payload["artifacts"]["transcript_path"])
    staged_subtitles = Path(draft_payload["artifacts"]["subtitles_path"])
    staged_watermark = Path(draft_payload["artifacts"]["watermark_path"])
    alignment_result = Path(draft_payload["artifacts"]["alignment_path"])
    assert staged_voice.is_relative_to(cache_root)
    assert staged_transcript.is_relative_to(cache_root)
    assert staged_subtitles.is_relative_to(cache_root)
    assert staged_watermark.is_relative_to(cache_root)
    assert alignment_result.is_relative_to(cache_root)
    assert staged_voice.is_file()
    assert staged_transcript.is_file()
    assert staged_subtitles.is_file()
    assert staged_watermark.is_file()
    assert alignment_result.is_file()
    assert transcript_source.read_text(encoding="utf-8") == "First sentence. Second sentence."
    assert watermark_source.read_bytes() == b"wm"
    assert recent_response.json() == []

    with connection() as conn:
        row = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()
    assert row is not None
    assert int(row["c"]) == 0


@pytest.mark.asyncio
async def test_subtitle_generate_stages_srt_and_uses_voice_cache(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    voice_source = source_dir / "voice.wav"
    _write_wav(voice_source)
    final_project_dir = tmp_path / "projects" / "future-project"
    final_project_dir.parent.mkdir()
    calls = 0

    async def fake_transcribe_audio(*args, **kwargs) -> AlignmentResult:
        nonlocal calls
        calls += 1
        return _subtitle_alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe_audio)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(final_project_dir),
                "name": "Future Project",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        first = await client.post(
            "/subtitle",
            json={"setup_id": setup_id, "voice_path": str(voice_source)},
        )
        second = await client.post("/subtitle", json={"setup_id": setup_id})
        draft_response = await client.get(f"/setup/drafts/{setup_id}")

    assert first.status_code == 200
    assert first.json() == {
        "status": "succeeded",
        "cue_count": 1,
        "total_duration_s": 1.0,
        "cache_state": "miss",
        "error_message": None,
    }
    assert second.status_code == 200
    assert second.json()["cache_state"] == "hit"
    assert calls == 1
    draft_payload = draft_response.json()
    staged_subtitles = Path(draft_payload["artifacts"]["subtitles_path"])
    assert staged_subtitles.is_file()
    assert staged_subtitles.read_bytes() == (
        b"1\r\n00:00:00,000 --> 00:00:01,000\r\nHello world.\r\n"
    )
    assert draft_payload["draft"]["subtitle_generation"]["status"] == "succeeded"
    assert final_project_dir.exists() is False


@pytest.mark.asyncio
async def test_subtitle_generate_returns_staged_file_error_for_missing_voice(
    tmp_path: Path,
) -> None:
    final_project_dir = tmp_path / "projects" / "future-project"
    final_project_dir.parent.mkdir()
    missing_voice = tmp_path / "source-files" / "missing.wav"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={"path": str(final_project_dir), "name": "Future Project"},
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        response = await client.post(
            "/subtitle",
            json={"setup_id": setup_id, "voice_path": str(missing_voice)},
        )
        draft_response = await client.get(f"/setup/drafts/{setup_id}")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_STAGED_FILE"
    assert draft_response.json()["draft"]["subtitle_generation"]["status"] == "failed"


@pytest.mark.asyncio
async def test_subtitle_generate_regenerates_when_cache_metadata_is_corrupt(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    voice_source = source_dir / "voice.wav"
    _write_wav(voice_source)
    final_project_dir = tmp_path / "projects" / "future-project"
    final_project_dir.parent.mkdir()
    calls = 0

    async def fake_transcribe_audio(*args, **kwargs) -> AlignmentResult:
        nonlocal calls
        calls += 1
        return _subtitle_alignment()

    monkeypatch.setattr(transcribe, "transcribe_audio", fake_transcribe_audio)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={"path": str(final_project_dir), "name": "Future Project"},
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        first = await client.post(
            "/subtitle",
            json={"setup_id": setup_id, "voice_path": str(voice_source)},
        )
        draft_response = await client.get(f"/setup/drafts/{setup_id}")
        staged_subtitles = Path(draft_response.json()["artifacts"]["subtitles_path"])
        metadata_path = staged_subtitles.parent.parent / "subtitle.json"
        metadata_path.write_text("{", encoding="utf-8")

        second = await client.post("/subtitle", json={"setup_id": setup_id})

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["cache_state"] == "miss"
    assert calls == 2


@pytest.mark.asyncio
async def test_subtitle_generate_rejects_unsupported_voice_codec(tmp_path: Path) -> None:
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    voice_source = source_dir / "voice.ogg"
    voice_source.write_bytes(b"ogg")
    final_project_dir = tmp_path / "projects" / "future-project"
    final_project_dir.parent.mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={"path": str(final_project_dir), "name": "Future Project"},
        )
        assert create_response.status_code == 200
        response = await client.post(
            "/subtitle",
            json={"setup_id": create_response.json()["setup_id"], "voice_path": str(voice_source)},
        )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_VOICE_CODEC"


@pytest.mark.asyncio
async def test_setup_draft_cancel_cleans_internal_cache_only(tmp_path: Path) -> None:
    source_dir = tmp_path / "source-files"
    source_dir.mkdir()
    voice_source = source_dir / "voice.wav"
    transcript_source = source_dir / "transcript.txt"
    _write_wav(voice_source)
    transcript_source.write_text("First sentence.", encoding="utf-8")
    final_project_dir = tmp_path / "projects" / "to-cancel"
    final_project_dir.parent.mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(final_project_dir),
                "name": "Cancel Me",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        update_response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={
                "voice_path": str(voice_source),
                "transcript_path": str(transcript_source),
            },
        )
        assert update_response.status_code == 200
        staged_voice = Path(update_response.json()["artifacts"]["voice_path"])
        staged_transcript = Path(update_response.json()["artifacts"]["transcript_path"])
        assert staged_voice.is_file()
        assert staged_transcript.is_file()

        cancel_response = await client.delete(f"/setup/drafts/{setup_id}")
        assert cancel_response.status_code == 200
        assert cancel_response.json() == {"ok": True}

        missing_response = await client.get(f"/setup/drafts/{setup_id}")
        assert missing_response.status_code == 404

    cache_root = settings.app_db_path.parent / "setup-cache"
    assert not (cache_root / setup_id).exists()
    assert not staged_voice.exists()
    assert not staged_transcript.exists()
    assert voice_source.is_file()
    assert transcript_source.read_text(encoding="utf-8") == "First sentence."


@pytest.mark.asyncio
async def test_setup_draft_patch_rejects_invalid_project_path(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    original_path = projects_root / "original"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={"path": str(original_path), "name": "Draft", "output_preset": "draft"},
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        relative_response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"path": "relative-project"},
        )
        missing_parent_response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"path": str(tmp_path / "missing-parent" / "project")},
        )
        draft_response = await client.get(f"/setup/drafts/{setup_id}")

    assert relative_response.status_code == 400
    assert relative_response.json()["error"]["code"] == "INVALID_PATH"
    assert missing_parent_response.status_code == 400
    assert missing_parent_response.json()["error"]["code"] == "INVALID_PATH"
    assert draft_response.status_code == 200
    assert draft_response.json()["draft"]["path"] == str(original_path)


@pytest.mark.asyncio
async def test_setup_draft_rejects_file_as_project_path_parent(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    parent_file = tmp_path / "not-a-directory"
    parent_file.write_text("not a directory", encoding="utf-8")
    invalid_path = parent_file / "project"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_invalid_response = await client.post(
            "/setup/drafts",
            json={"path": str(invalid_path), "name": "Invalid", "output_preset": "draft"},
        )
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "valid"),
                "name": "Valid",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]
        patch_invalid_response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"path": str(invalid_path)},
        )

    assert create_invalid_response.status_code == 400
    assert create_invalid_response.json()["error"]["code"] == "INVALID_PATH"
    assert patch_invalid_response.status_code == 400
    assert patch_invalid_response.json()["error"]["code"] == "INVALID_PATH"


@pytest.mark.asyncio
async def test_setup_draft_stage_same_file_is_noop(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "same-file"),
                "name": "Same File",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]
        staged_voice = settings.app_db_path.parent / "setup-cache" / setup_id / "artifacts" / "voice.wav"
        _write_wav(staged_voice)

        response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"voice_path": str(staged_voice)},
        )

    assert response.status_code == 200
    assert response.json()["artifacts"]["voice_path"] == str(staged_voice)
    assert staged_voice.is_file()


@pytest.mark.asyncio
async def test_setup_draft_stage_copy_failure_returns_controlled_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    voice_source = tmp_path / "voice.wav"
    _write_wav(voice_source)

    def fail_copy(_source: Path, _destination: Path) -> None:
        raise OSError("copy failed")

    monkeypatch.setattr("server.routes.setup.shutil.copy2", fail_copy)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "copy-failure"),
                "name": "Copy Failure",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"voice_path": str(voice_source)},
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_STAGED_FILE"


@pytest.mark.asyncio
async def test_setup_draft_cleanup_ignores_tampered_external_path(tmp_path: Path) -> None:
    projects_root = tmp_path / "projects"
    projects_root.mkdir()
    external_file = tmp_path / "must-survive.txt"
    external_file.write_text("keep", encoding="utf-8")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/setup/drafts",
            json={
                "path": str(projects_root / "tampered"),
                "name": "Tampered",
                "output_preset": "draft",
            },
        )
        assert create_response.status_code == 200
        setup_id = create_response.json()["setup_id"]

        record_path = settings.app_db_path.parent / "setup-cache" / setup_id / "draft.json"
        record = json.loads(record_path.read_text(encoding="utf-8"))
        record["voice_staged_path"] = str(external_file)
        record["voice_source_path"] = str(external_file)
        record_path.write_text(json.dumps(record), encoding="utf-8")

        response = await client.patch(
            f"/setup/drafts/{setup_id}",
            json={"voice_path": None},
        )

    assert response.status_code == 200
    assert external_file.read_text(encoding="utf-8") == "keep"
