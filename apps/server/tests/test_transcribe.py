"""Unit tests for the WhisperX alignment wrapper (T3.2).

Tests use mocks so whisperx / torch are never loaded and asyncio.to_thread
never spawns real OS threads (which triggers torch DLL double-init on Windows).
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import ANY, MagicMock, patch

import pytest

from server.domain.timing import AlignmentResult, Sentence
from server.pipeline import transcribe

_SENTENCES = [
    Sentence(index=1, text="Hello world.", char_start=0, char_end=12),
    Sentence(index=2, text="Goodbye.", char_start=13, char_end=21),
]

_FAKE_WHISPERX_RESULT = {
    "segments": [
        {
            "text": "Hello world.",
            "start": 0.0,
            "end": 1.5,
            "words": [
                {"word": "Hello", "start": 0.0, "end": 0.7, "score": 0.9},
                {"word": "world", "start": 0.7, "end": 1.5, "score": 0.85},
            ],
        },
        {
            "text": "Goodbye.",
            "start": 1.6,
            "end": 2.2,
            "words": [{"word": "Goodbye", "start": 1.6, "end": 2.2, "score": 0.8}],
        },
    ]
}


def _make_wx_mock() -> MagicMock:
    mock_wx = MagicMock()
    mock_wx.load_audio.return_value = [0.0] * 32000  # 2 s at 16 kHz
    mock_wx.load_align_model.return_value = (MagicMock(), MagicMock())
    mock_wx.align.return_value = _FAKE_WHISPERX_RESULT
    return mock_wx


@pytest.fixture(autouse=True)
def _reset_cache() -> None:
    transcribe._align_model = None
    transcribe._align_metadata = None
    transcribe._align_device = None


async def _align(
    wav: Path,
    sentences: list[Sentence],
    language: str = "en",
) -> AlignmentResult:
    """Run transcribe.align with whisperx, torch, and threading mocked out."""
    mock_wx = _make_wx_mock()

    async def _inline(fn, *args, **kwargs):  # type: ignore[override]
        return fn(*args, **kwargs)

    with (
        patch.dict(sys.modules, {"whisperx": mock_wx}),
        patch.object(transcribe, "_device", return_value="cpu"),
        patch.object(asyncio, "to_thread", side_effect=_inline),
    ):
        return await transcribe.align(wav, sentences, language=language)


@pytest.mark.asyncio
async def test_align_returns_alignment_result(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert isinstance(result, AlignmentResult)


@pytest.mark.asyncio
async def test_align_sentence_count_matches(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert len(result.sentences) == 2


@pytest.mark.asyncio
async def test_align_sentence_timestamps(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert result.sentences[0].start_s == pytest.approx(0.0)
    assert result.sentences[0].end_s == pytest.approx(1.5)
    assert result.sentences[1].start_s == pytest.approx(1.6)
    assert result.sentences[1].end_s == pytest.approx(2.2)


@pytest.mark.asyncio
async def test_align_sentence_index_preserved(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert result.sentences[0].index == 1
    assert result.sentences[1].index == 2


@pytest.mark.asyncio
async def test_align_word_count(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert len(result.words) == 3  # 2 words in sent 1 + 1 in sent 2


@pytest.mark.asyncio
async def test_align_confidence_averaged(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    # sentence 1: (0.9 + 0.85) / 2 = 0.875
    assert result.sentences[0].confidence_avg == pytest.approx(0.875)
    # sentence 2: 0.8 / 1 = 0.8
    assert result.sentences[1].confidence_avg == pytest.approx(0.8)


@pytest.mark.asyncio
async def test_align_cache_hit_false_on_fresh_run(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert result.cache_hit is False


@pytest.mark.asyncio
async def test_align_word_sentence_index(tmp_path: Path) -> None:
    result = await _align(tmp_path / "v.wav", _SENTENCES)
    assert result.words[0].sentence_index == 1
    assert result.words[2].sentence_index == 2


@pytest.mark.asyncio
async def test_align_passes_language_to_load_model(tmp_path: Path) -> None:
    mock_wx = _make_wx_mock()

    async def _inline(fn, *args, **kwargs):  # type: ignore[override]
        return fn(*args, **kwargs)

    with (
        patch.dict(sys.modules, {"whisperx": mock_wx}),
        patch.object(transcribe, "_device", return_value="cpu"),
        patch.object(asyncio, "to_thread", side_effect=_inline),
    ):
        await transcribe.align(tmp_path / "v.wav", _SENTENCES, language="fr")

    mock_wx.load_align_model.assert_called_once_with(language_code="fr", device=ANY)
