"""WhisperX forced-alignment wrapper.

Loads the wav2vec2 phonetic alignment model lazily and caches it in
module scope. CUDA is auto-detected; falls back to CPU on OOM.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult, Sentence

_align_model: Any = None
_align_metadata: Any = None
_align_device: str | None = None
_transcribe_model: Any = None
_transcribe_model_name: str | None = None
_transcribe_device: str | None = None


def _device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def _load_model(device: str, language: str = "en") -> tuple[Any, Any]:
    global _align_model, _align_metadata, _align_device
    if _align_model is not None and _align_device == device:
        return _align_model, _align_metadata
    import whisperx  # type: ignore[import-untyped]

    model, metadata = whisperx.load_align_model(language_code=language, device=device)
    _align_model, _align_metadata, _align_device = model, metadata, device
    return model, metadata


def _load_transcribe_model(model_name: str, device: str) -> Any:
    global _transcribe_model, _transcribe_model_name, _transcribe_device
    if (
        _transcribe_model is not None
        and _transcribe_model_name == model_name
        and _transcribe_device == device
    ):
        return _transcribe_model
    import whisperx

    model = whisperx.load_model(model_name, device=device)
    _transcribe_model = model
    _transcribe_model_name = model_name
    _transcribe_device = device
    return model


def _run_align(
    audio_path: Path,
    sentences: list[Sentence],
    device: str,
    language: str = "en",
) -> AlignmentResult:
    import whisperx

    audio = whisperx.load_audio(str(audio_path))
    duration = len(audio) / 16000.0
    step = duration / max(len(sentences), 1)

    input_segments = [
        {"text": s.text, "start": i * step, "end": (i + 1) * step}
        for i, s in enumerate(sentences)
    ]

    try:
        model, metadata = _load_model(device, language)
        result = whisperx.align(
            input_segments,
            model,
            metadata,
            audio,
            device,
            return_char_alignments=False,
        )
    except RuntimeError as exc:
        if "CUDA out of memory" not in str(exc) or device == "cpu":
            raise
        model, metadata = _load_model("cpu", language)
        result = whisperx.align(
            input_segments,
            model,
            metadata,
            audio,
            "cpu",
            return_char_alignments=False,
        )

    aligned_sentences: list[AlignedSentence] = []
    aligned_words: list[AlignedWord] = []

    for i, seg in enumerate(result.get("segments", [])):
        words_raw = seg.get("words", [])
        confidences = [float(w.get("score", 0.5)) for w in words_raw]
        conf_avg = sum(confidences) / max(len(confidences), 1)
        sent_idx = sentences[i].index if i < len(sentences) else i + 1

        aligned_sentences.append(
            AlignedSentence(
                index=sent_idx,
                text=seg.get("text", ""),
                start_s=float(seg.get("start", 0.0)),
                end_s=float(seg.get("end", 0.0)),
                confidence_avg=conf_avg,
            )
        )
        for w in words_raw:
            aligned_words.append(
                AlignedWord(
                    sentence_index=sent_idx,
                    text=str(w.get("word", "")),
                    start_s=float(w.get("start", 0.0)),
                    end_s=float(w.get("end", 0.0)),
                    confidence=float(w.get("score", 0.5)),
                )
            )

    return AlignmentResult(sentences=aligned_sentences, words=aligned_words)


def _run_transcribe(
    audio_path: Path,
    device: str,
    model_name: str,
    batch_size: int,
) -> AlignmentResult:
    import whisperx

    audio = whisperx.load_audio(str(audio_path))
    model = _load_transcribe_model(model_name, device)
    result = model.transcribe(audio, batch_size=batch_size)
    return _segments_to_alignment_result(result.get("segments", []))


def _segments_to_alignment_result(segments: list[dict[str, Any]]) -> AlignmentResult:
    aligned_sentences: list[AlignedSentence] = []
    aligned_words: list[AlignedWord] = []

    for index, segment in enumerate(segments, start=1):
        text = str(segment.get("text", "")).strip()
        start_s = float(segment.get("start", 0.0))
        end_s = float(segment.get("end", start_s))
        words = _segment_words(segment, sentence_index=index, start_s=start_s, end_s=end_s)
        confidences = [word.confidence for word in words]
        aligned_sentences.append(
            AlignedSentence(
                index=index,
                text=text,
                start_s=start_s,
                end_s=end_s,
                confidence_avg=sum(confidences) / max(len(confidences), 1),
            )
        )
        aligned_words.extend(words)

    return AlignmentResult(sentences=aligned_sentences, words=aligned_words)


def _segment_words(
    segment: dict[str, Any],
    *,
    sentence_index: int,
    start_s: float,
    end_s: float,
) -> list[AlignedWord]:
    raw_words = segment.get("words")
    if isinstance(raw_words, list) and raw_words:
        return [
            AlignedWord(
                sentence_index=sentence_index,
                text=str(word.get("word") or word.get("text") or "").strip(),
                start_s=float(word.get("start", start_s)),
                end_s=float(word.get("end", end_s)),
                confidence=float(word.get("score", word.get("confidence", 0.5))),
            )
            for word in raw_words
            if str(word.get("word") or word.get("text") or "").strip()
        ]

    text_words = str(segment.get("text", "")).strip().split()
    if not text_words:
        return []
    step = max(0.0, end_s - start_s) / len(text_words)
    return [
        AlignedWord(
            sentence_index=sentence_index,
            text=word,
            start_s=start_s + step * index,
            end_s=start_s + step * (index + 1),
            confidence=0.5,
        )
        for index, word in enumerate(text_words)
    ]


async def align(
    audio_path: Path,
    sentences: list[Sentence],
    language: str = "en",
    device: str | None = None,
) -> AlignmentResult:
    """Run WhisperX forced alignment in a thread pool."""
    dev = device or _device()
    return await asyncio.to_thread(_run_align, audio_path, sentences, dev, language)


async def transcribe_audio(
    audio_path: Path,
    *,
    model_name: str = "large-v3",
    batch_size: int = 16,
    device: str | None = None,
) -> AlignmentResult:
    """Run WhisperX ASR in a thread pool and normalize segments for SRT generation."""
    dev = device or _device()
    return await asyncio.to_thread(_run_transcribe, audio_path, dev, model_name, batch_size)
