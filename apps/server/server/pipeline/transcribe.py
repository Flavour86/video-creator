"""WhisperX forced-alignment wrapper.

Loads the wav2vec2 phonetic alignment model lazily and caches it in
module scope. CUDA is auto-detected; falls back to CPU on OOM.
"""
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
from typing import Any, cast

import numpy as np
import numpy.typing as npt

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult, Sentence

_align_model: Any = None
_align_metadata: Any = None
_align_device: str | None = None
_align_language: str | None = None
_transcribe_model: Any = None
_transcribe_model_name: str | None = None
_transcribe_device: str | None = None
FloatArray = npt.NDArray[np.float32]


def _device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def _load_model(device: str, language: str = "en") -> tuple[Any, Any]:
    global _align_model, _align_metadata, _align_device, _align_language
    if (
        _align_model is not None
        and _align_device == device
        and _align_language == language
    ):
        return _align_model, _align_metadata
    import whisperx  # type: ignore[import-untyped]

    model, metadata = whisperx.load_align_model(language_code=language, device=device)
    _align_model, _align_metadata, _align_device, _align_language = (
        model,
        metadata,
        device,
        language,
    )
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
    audio = _load_audio_array(audio_path)
    duration = len(audio) / 16000.0
    step = duration / max(len(sentences), 1)

    input_segments = [
        {"text": s.text, "start": i * step, "end": (i + 1) * step}
        for i, s in enumerate(sentences)
    ]

    result = _align_segments(input_segments, audio, device, language)

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


def _align_segments(
    input_segments: list[dict[str, Any]],
    audio: FloatArray,
    device: str,
    language: str,
) -> dict[str, Any]:
    import whisperx

    try:
        model, metadata = _load_model(device, language)
        return cast(
            dict[str, Any],
            whisperx.align(
                input_segments,
                model,
                metadata,
                audio,
                device,
                return_char_alignments=False,
            ),
        )
    except RuntimeError as exc:
        if "CUDA out of memory" not in str(exc) or device == "cpu":
            raise
        model, metadata = _load_model("cpu", language)
        return cast(
            dict[str, Any],
            whisperx.align(
                input_segments,
                model,
                metadata,
                audio,
                "cpu",
                return_char_alignments=False,
            ),
        )


def _run_transcribe(
    audio_path: Path,
    device: str,
    model_name: str,
    batch_size: int,
) -> AlignmentResult:
    audio = _load_audio_array(audio_path)
    model = _load_transcribe_model(model_name, device)
    result = model.transcribe(audio, batch_size=batch_size)
    segments = result.get("segments", [])
    if not segments:
        return AlignmentResult(sentences=[], words=[])
    language = str(result.get("language") or "en")
    # Keep the large ASR model on CUDA; a second alignment model can exhaust GPU memory.
    alignment_device = "cpu" if device == "cuda" else device
    aligned = _align_segments(segments, audio, alignment_device, language)
    return _segments_to_alignment_result(aligned.get("segments", segments))


def _load_audio_array(audio_path: Path, sample_rate: int = 16000) -> FloatArray:
    """Decode audio without torchcodec/torio so Windows FFmpeg DLL issues do not break ASR."""
    try:
        return _load_audio_with_ffmpeg(audio_path, sample_rate)
    except RuntimeError:
        try:
            return _load_audio_with_soundfile(audio_path, sample_rate)
        except RuntimeError as soundfile_error:
            raise RuntimeError(
                "Audio decoding failed. Ensure ffmpeg is installed and the voice file is readable."
            ) from soundfile_error


def _load_audio_with_ffmpeg(audio_path: Path, sample_rate: int) -> FloatArray:
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-i",
                str(audio_path),
                "-ac",
                "1",
                "-ar",
                str(sample_rate),
                "-f",
                "f32le",
                "pipe:1",
            ],
            check=False,
            capture_output=True,
            timeout=30,
        )
    except (FileNotFoundError, OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeError("ffmpeg audio decode failed.") from exc

    if result.returncode != 0 or not result.stdout:
        raise RuntimeError("ffmpeg audio decode failed.")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def _load_audio_with_soundfile(audio_path: Path, sample_rate: int) -> FloatArray:
    try:
        import soundfile  # type: ignore[import-untyped]

        data, source_rate = soundfile.read(str(audio_path), dtype="float32", always_2d=True)
    except Exception as exc:
        raise RuntimeError("soundfile audio decode failed.") from exc

    if data.size == 0:
        raise RuntimeError("Decoded audio is empty.")
    mono = np.asarray(data, dtype=np.float32).mean(axis=1)
    if int(source_rate) != sample_rate:
        mono = _resample_linear(mono, int(source_rate), sample_rate)
    return cast(FloatArray, mono.astype(np.float32, copy=False))


def _resample_linear(audio: FloatArray, source_rate: int, target_rate: int) -> FloatArray:
    if source_rate <= 0 or target_rate <= 0 or source_rate == target_rate:
        return audio
    if audio.size == 0:
        return audio
    duration = audio.size / float(source_rate)
    target_size = max(1, round(duration * target_rate))
    source_positions = np.linspace(0.0, duration, num=audio.size, endpoint=False)
    target_positions = np.linspace(0.0, duration, num=target_size, endpoint=False)
    return cast(FloatArray, np.interp(target_positions, source_positions, audio).astype(np.float32))


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
