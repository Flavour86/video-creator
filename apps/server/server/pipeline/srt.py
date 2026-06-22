"""SRT subtitle generation from word-level alignment."""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult

MAX_LINE_CHARS = 42
MAX_CUE_LINES = 2
MAX_CUE_SECONDS = 7.0
MIN_CUE_SECONDS = 0.2

SENTENCE_PUNCTUATION = (".", "!", "?", "\u3002", "\uff01", "\uff1f")
CLAUSE_PUNCTUATION = (",", ";", ":", "\uff0c", "\uff1b", "\uff1a", "\u3001")
BREAK_PUNCTUATION = SENTENCE_PUNCTUATION + CLAUSE_PUNCTUATION
CLOSING_PUNCTUATION = ".,!?;:\uff0c\u3002\uff01\uff1f\uff1b\uff1a\u3001)]}\u3011\u300b"
OPENING_PUNCTUATION = "([{\u3010\u300a"


@dataclass(frozen=True)
class _Cue:
    words: list[AlignedWord]
    preserve_end: bool = False


@dataclass(frozen=True)
class SubtitleStats:
    cue_count: int
    total_duration_s: float


@dataclass(frozen=True)
class SubtitleAlignmentUpdate:
    corrections_applied: int
    cue_count: int


@dataclass(frozen=True)
class TranscriptCorrectionResult:
    update: SubtitleAlignmentUpdate
    alignment: AlignmentResult


@dataclass(frozen=True)
class _ParsedSrtCue:
    index: int
    timing: str
    text: str


def generate_srt(alignment: AlignmentResult, *, max_line_chars: int = MAX_LINE_CHARS) -> str:
    safe_max_line_chars = _normalize_max_line_chars(max_line_chars)
    cues = _build_cues(alignment, max_line_chars=safe_max_line_chars)
    cue_spans = _normalized_cue_spans(cues)
    blocks = [
        "\r\n".join(
            [
                str(index),
                (
                    f"{_format_timestamp(span[0])} "
                    f"--> {_format_timestamp(span[1])}"
                ),
                *_wrap_text(_words_text(cue.words), max_line_chars=safe_max_line_chars),
            ]
        )
        for index, (cue, span) in enumerate(zip(cues, cue_spans, strict=True), start=1)
    ]
    return "\r\n\r\n".join(blocks) + ("\r\n" if blocks else "")


def alignment_with_sentence_text_overrides(
    alignment: AlignmentResult,
    sentence_overrides: Iterable[object] | None,
) -> AlignmentResult:
    overrides = _sentence_text_overrides(sentence_overrides)
    if not overrides:
        return alignment

    updated_sentences: list[AlignedSentence] = []
    updated_words: list[AlignedWord] = []
    words_by_sentence: dict[int, list[AlignedWord]] = {}
    for word in alignment.words:
        words_by_sentence.setdefault(word.sentence_index, []).append(word)

    applied_indexes: set[int] = set()
    for sentence in alignment.sentences:
        text = overrides.get(sentence.index)
        if text is None:
            updated_sentences.append(sentence)
            updated_words.extend(words_by_sentence.get(sentence.index, []))
            continue

        applied_indexes.add(sentence.index)
        updated_sentences.append(sentence.model_copy(update={"text": text}))
        updated_words.append(
            AlignedWord(
                sentence_index=sentence.index,
                text=text,
                start_s=sentence.start_s,
                end_s=sentence.end_s,
                confidence=sentence.confidence_avg,
            )
        )

    if not applied_indexes:
        return alignment

    known_sentence_indexes = {sentence.index for sentence in alignment.sentences}
    updated_words.extend(
        word for word in alignment.words if word.sentence_index not in known_sentence_indexes
    )
    return AlignmentResult(
        sentences=updated_sentences,
        words=updated_words,
        cache_hit=alignment.cache_hit,
    )


def write_srt(
    project_dir: Path,
    alignment: AlignmentResult,
    *,
    max_line_chars: int = MAX_LINE_CHARS,
) -> Path:
    return write_srt_file(
        project_dir / "subtitles.srt",
        alignment,
        max_line_chars=max_line_chars,
    )


def write_srt_file(
    srt_path: Path,
    alignment: AlignmentResult,
    *,
    max_line_chars: int = MAX_LINE_CHARS,
) -> Path:
    srt_path.write_text(
        generate_srt(alignment, max_line_chars=max_line_chars),
        encoding="utf-8",
        newline="",
    )
    return srt_path


def write_aligned_srt_file(
    srt_path: Path,
    alignment: AlignmentResult,
    *,
    max_line_chars: int = MAX_LINE_CHARS,
) -> SubtitleAlignmentUpdate:
    previous_content = ""
    if srt_path.is_file():
        previous_content = srt_path.read_text(encoding="utf-8")

    next_content = generate_srt(alignment, max_line_chars=max_line_chars)
    corrections = _count_cue_level_corrections(previous_content, next_content)
    srt_path.write_text(next_content, encoding="utf-8", newline="")
    return SubtitleAlignmentUpdate(
        corrections_applied=corrections,
        cue_count=len(_parse_srt_cues(next_content)),
    )


def write_transcript_corrected_srt_file(
    srt_path: Path,
    transcript_text: str,
) -> TranscriptCorrectionResult:
    previous_content = srt_path.read_text(encoding="utf-8")
    corrected_content = correct_srt_text_from_transcript(previous_content, transcript_text)
    corrections = _count_cue_level_corrections(previous_content, corrected_content)
    srt_path.write_text(corrected_content, encoding="utf-8", newline="")
    return TranscriptCorrectionResult(
        update=SubtitleAlignmentUpdate(
            corrections_applied=corrections,
            cue_count=len(_parse_srt_cues(corrected_content)),
        ),
        alignment=_alignment_from_srt(corrected_content),
    )


def correct_srt_text_from_transcript(srt_content: str, transcript_text: str) -> str:
    cues = _parse_srt_blocks(srt_content)
    if not cues:
        return srt_content

    source_chars: list[str] = []
    source_refs: list[tuple[int, int]] = []
    cue_texts = [cue.text for cue in cues]
    for cue_index, cue_text in enumerate(cue_texts):
        for char_index, character in enumerate(cue_text):
            if _is_correctable_text_character(character):
                source_chars.append(character)
                source_refs.append((cue_index, char_index))

    if not source_chars:
        return srt_content

    transcript_chars = [
        character
        for character in transcript_text
        if _is_correctable_text_character(character)
    ]
    if not transcript_chars:
        return srt_content

    corrected_chars = _correct_source_chars(source_chars, transcript_chars)
    corrected_texts = [list(text) for text in cue_texts]
    for (cue_index, char_index), character in zip(source_refs, corrected_chars, strict=True):
        corrected_texts[cue_index][char_index] = character

    corrected_cues = [
        _ParsedSrtCue(
            index=cue.index,
            timing=cue.timing,
            text="".join(corrected_texts[index]),
        )
        for index, cue in enumerate(cues)
    ]
    return _format_srt_blocks(corrected_cues)


def subtitle_stats(
    alignment: AlignmentResult,
    *,
    max_line_chars: int = MAX_LINE_CHARS,
) -> SubtitleStats:
    safe_max_line_chars = _normalize_max_line_chars(max_line_chars)
    cues = _build_cues(alignment, max_line_chars=safe_max_line_chars)
    cue_spans = _normalized_cue_spans(cues)
    total_duration_s = sum(
        max(0.0, end_s - start_s)
        for start_s, end_s in cue_spans
    )
    return SubtitleStats(cue_count=len(cues), total_duration_s=round(total_duration_s, 3))


def _build_cues(alignment: AlignmentResult, *, max_line_chars: int) -> list[_Cue]:
    cues: list[_Cue] = []
    for sentence in alignment.sentences:
        sentence_words = [
            word
            for word in alignment.words
            if word.sentence_index == sentence.index and word.text.strip()
        ]
        preserve_sentence_end = _is_sentence_span_text_word(sentence, sentence_words)
        words = [
            readable_word
            for word in sentence_words
            for readable_word in _split_oversized_word(
                word,
                max_line_chars=max_line_chars,
            )
        ]
        start = 0
        while start < len(words):
            end = _best_chunk_end(words, start, max_line_chars=max_line_chars)
            cues.append(
                _Cue(
                    words=words[start:end],
                    preserve_end=preserve_sentence_end and end == len(words),
                )
            )
            start = end
    return cues


def _split_oversized_word(word: AlignedWord, *, max_line_chars: int) -> list[AlignedWord]:
    if _fits_cue([word], max_line_chars=max_line_chars) and (
        word.end_s - word.start_s <= MAX_CUE_SECONDS
    ):
        return [word]

    text = word.text.strip()
    if not text:
        return []
    duration_s = max(0.0, word.end_s - word.start_s)
    max_cue_chars = max_line_chars * MAX_CUE_LINES
    if duration_s > 0:
        duration_chars = max(
            1,
            math.floor(_visible_length(text) * (MAX_CUE_SECONDS - 0.001) / duration_s),
        )
        chunk_limit = min(max_cue_chars, duration_chars)
    else:
        chunk_limit = max_cue_chars
    fragments = _split_text_chunks(text, chunk_limit)
    if len(fragments) == 1:
        return [word]

    split_words: list[AlignedWord] = []
    offset = 0
    for fragment in fragments:
        start_ratio = offset / len(text)
        offset += len(fragment)
        end_ratio = offset / len(text)
        split_words.append(
            AlignedWord(
                sentence_index=word.sentence_index,
                text=fragment,
                start_s=word.start_s + duration_s * start_ratio,
                end_s=word.start_s + duration_s * end_ratio,
                confidence=word.confidence,
            )
        )
    return split_words


def _split_text_chunks(text: str, chunk_limit: int) -> list[str]:
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = _visible_chunk_end(text, start, chunk_limit)
        if end < len(text):
            earliest_break = _visible_chunk_end(text, start, max(1, chunk_limit // 2))
            for candidate in range(end, earliest_break - 1, -1):
                if text[candidate - 1] in BREAK_PUNCTUATION:
                    end = candidate
                    break
        chunks.append(text[start:end])
        start = end
    return chunks


def _visible_chunk_end(text: str, start: int, limit: int) -> int:
    end = start
    width = 0
    while end < len(text):
        next_width = _visible_char_width(text[end])
        if end > start and width + next_width > limit:
            break
        width += next_width
        end += 1
    return max(start + 1, end)


def _normalized_cue_spans(cues: list[_Cue]) -> list[tuple[float, float]]:
    spans = [
        (cue.words[0].start_s, cue.words[-1].end_s, cue.preserve_end)
        for cue in cues
        if cue.words
    ]
    normalized: list[tuple[float, float]] = []
    for index, (start_s, end_s, preserve_end) in enumerate(spans):
        next_start = spans[index + 1][0] if index + 1 < len(spans) else None
        next_end = end_s
        if not preserve_end and next_start is not None and next_end < next_start:
            next_end = next_start
        if next_end <= start_s:
            if next_start is not None and next_start > start_s:
                next_end = next_start
            else:
                next_end = start_s + MIN_CUE_SECONDS
        normalized.append((start_s, next_end))
    return normalized


def _best_chunk_end(words: list[AlignedWord], start: int, *, max_line_chars: int) -> int:
    limit = start + 1
    for index in range(start + 1, len(words) + 1):
        chunk = words[start:index]
        duration_s = chunk[-1].end_s - chunk[0].start_s
        if duration_s > MAX_CUE_SECONDS or not _fits_cue(chunk, max_line_chars=max_line_chars):
            break
        limit = index

    if limit == len(words):
        return limit

    for punctuation in (SENTENCE_PUNCTUATION, CLAUSE_PUNCTUATION):
        for index in range(limit - 1, start, -1):
            if words[index - 1].text.rstrip().endswith(punctuation):
                return index

    return limit


def _fits_cue(words: list[AlignedWord], *, max_line_chars: int) -> bool:
    text = _words_text(words)
    max_cue_chars = max_line_chars * MAX_CUE_LINES
    if _visible_length(text) > max_cue_chars:
        return False
    lines = _wrap_text(text, max_line_chars=max_line_chars)
    return len(lines) <= MAX_CUE_LINES and all(
        _visible_length(line) <= max_line_chars for line in lines
    )


def _wrap_text(text: str, *, max_line_chars: int) -> list[str]:
    words = [
        part
        for word in text.split()
        for part in _split_text_chunks(word, max_line_chars)
    ]
    if not words:
        return [""]

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if _visible_length(candidate) <= max_line_chars or not current:
            current = candidate
            continue
        lines.append(current)
        current = word

    if current:
        lines.append(current)

    return lines


def _normalize_max_line_chars(value: int) -> int:
    if not isinstance(value, int):
        return MAX_LINE_CHARS
    return max(20, min(80, value))


def _visible_length(value: str) -> int:
    return sum(_visible_char_width(character) for character in value)


def _visible_char_width(character: str) -> int:
    return 2 if _is_wide_character(character) else 1


def _is_wide_character(character: str) -> bool:
    codepoint = ord(character)
    return (
        0x1100 <= codepoint <= 0x115F
        or 0x2E80 <= codepoint <= 0xA4CF
        or 0xAC00 <= codepoint <= 0xD7AF
        or 0xF900 <= codepoint <= 0xFAFF
        or 0xFE10 <= codepoint <= 0xFE6F
        or 0xFF00 <= codepoint <= 0xFF60
        or 0xFFE0 <= codepoint <= 0xFFE6
    )


def _is_sentence_span_text_word(
    sentence: AlignedSentence,
    sentence_words: list[AlignedWord],
) -> bool:
    if len(sentence_words) != 1:
        return False
    word = sentence_words[0]
    return (
        word.text.strip() == sentence.text.strip()
        and math.isclose(word.start_s, sentence.start_s, abs_tol=0.001)
        and math.isclose(word.end_s, sentence.end_s, abs_tol=0.001)
    )


def _sentence_text_overrides(sentence_overrides: Iterable[object] | None) -> dict[int, str]:
    if sentence_overrides is None:
        return {}

    overrides: dict[int, str] = {}
    for cue in sentence_overrides:
        raw_index = _cue_value(cue, "index")
        raw_text = _cue_value(cue, "text")
        if not isinstance(raw_text, str):
            continue
        text = raw_text.strip()
        if not text:
            continue
        try:
            index = int(raw_index)
        except (TypeError, ValueError):
            continue
        if index < 1:
            continue
        overrides[index] = text
    return overrides


def _cue_value(cue: object, key: str) -> Any:
    if isinstance(cue, Mapping):
        return cue.get(key)
    return getattr(cue, key, None)


def _words_text(words: list[AlignedWord]) -> str:
    tokens = [word.text.strip() for word in words if word.text.strip()]
    if not tokens:
        return ""
    text = tokens[0]
    for token in tokens[1:]:
        if _needs_space(text[-1], token[0]):
            text += " "
        text += token
    return text


def _needs_space(previous: str, current: str) -> bool:
    return not (
        _is_cjk(previous)
        or _is_cjk(current)
        or current in CLOSING_PUNCTUATION
        or previous in OPENING_PUNCTUATION
    )


def _is_cjk(character: str) -> bool:
    codepoint = ord(character)
    return (
        0x3400 <= codepoint <= 0x4DBF
        or 0x4E00 <= codepoint <= 0x9FFF
        or 0xF900 <= codepoint <= 0xFAFF
    )


def _format_timestamp(seconds: float) -> str:
    millis = round(max(seconds, 0.0) * 1000)
    hours, remainder = divmod(millis, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, ms = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"


def _count_cue_level_corrections(previous: str, current: str) -> int:
    previous_cues = _parse_srt_cues(previous)
    current_cues = _parse_srt_cues(current)
    return _cue_edit_distance(previous_cues, current_cues)


def _parse_srt_cues(content: str) -> list[tuple[str, str]]:
    return [(cue.timing, cue.text) for cue in _parse_srt_blocks(content)]


def _parse_srt_blocks(content: str) -> list[_ParsedSrtCue]:
    blocks = [block for block in content.replace("\r\n", "\n").split("\n\n") if block.strip()]
    cues: list[_ParsedSrtCue] = []
    for fallback_index, block in enumerate(blocks, start=1):
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if len(lines) < 2:
            continue
        try:
            index = int(lines[0])
            timing = lines[1]
            text_lines = lines[2:]
        except ValueError:
            index = fallback_index
            timing = lines[0]
            text_lines = lines[1:]
        cues.append(_ParsedSrtCue(index=index, timing=timing, text=" ".join(text_lines).strip()))
    return cues


def _format_srt_blocks(cues: list[_ParsedSrtCue]) -> str:
    blocks = [
        "\r\n".join([str(index), cue.timing, cue.text])
        for index, cue in enumerate(cues, start=1)
    ]
    return "\r\n\r\n".join(blocks) + ("\r\n" if blocks else "")


def _correct_source_chars(source: list[str], transcript: list[str]) -> list[str]:
    corrected = source.copy()
    matcher = SequenceMatcher(None, source, transcript, autojunk=False)
    for tag, source_start, source_end, transcript_start, transcript_end in matcher.get_opcodes():
        if tag in {"equal", "delete"}:
            continue
        if tag == "insert":
            continue
        source_span = source_end - source_start
        transcript_span = transcript_end - transcript_start
        source_slice = source[source_start:source_end]
        transcript_slice = transcript[transcript_start:transcript_end]
        if not _should_apply_transcript_replacement(source_slice, transcript_slice):
            continue
        replacement_len = min(source_span, transcript_span)
        for offset in range(replacement_len):
            corrected[source_start + offset] = transcript[transcript_start + offset]
    return corrected


def _should_apply_transcript_replacement(source: list[str], transcript: list[str]) -> bool:
    if not source or not transcript:
        return False
    if len(source) == len(transcript) == 1:
        if not (source[0].isascii() and transcript[0].isascii()):
            return False
        return True

    span_ratio = min(len(source), len(transcript)) / max(len(source), len(transcript))
    if span_ratio < 0.5:
        return False

    similarity = SequenceMatcher(None, source, transcript, autojunk=False).ratio()
    if max(len(source), len(transcript)) > 8:
        return similarity >= 0.65
    return similarity >= 0.35


def _alignment_from_srt(content: str) -> AlignmentResult:
    sentences: list[AlignedSentence] = []
    words: list[AlignedWord] = []
    for cue in _parse_srt_blocks(content):
        start_s, end_s = _parse_timing(cue.timing)
        sentences.append(
            AlignedSentence(
                index=cue.index,
                text=cue.text,
                start_s=start_s,
                end_s=end_s,
                confidence_avg=1.0,
            )
        )
        if cue.text:
            words.append(
                AlignedWord(
                    sentence_index=cue.index,
                    text=cue.text,
                    start_s=start_s,
                    end_s=end_s,
                    confidence=1.0,
                )
            )
    return AlignmentResult(sentences=sentences, words=words)


def _parse_timing(timing: str) -> tuple[float, float]:
    left, right = timing.split("-->", maxsplit=1)
    return _parse_timestamp(left.strip()), _parse_timestamp(right.strip())


def _parse_timestamp(timestamp: str) -> float:
    hours, minutes, rest = timestamp.split(":")
    seconds, millis = rest.split(",")
    return (
        int(hours) * 3600
        + int(minutes) * 60
        + int(seconds)
        + int(millis) / 1000
    )


def _is_correctable_text_character(character: str) -> bool:
    if character.isspace():
        return False
    return re.match(r"[\w\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]", character) is not None


def _cue_edit_distance(
    previous_cues: list[tuple[str, str]],
    current_cues: list[tuple[str, str]],
) -> int:
    previous_len = len(previous_cues)
    current_len = len(current_cues)
    previous_row = list(range(current_len + 1))
    for left in range(1, previous_len + 1):
        current_row = [left] + [0] * current_len
        for right in range(1, current_len + 1):
            replace_cost = 0 if previous_cues[left - 1] == current_cues[right - 1] else 1
            current_row[right] = min(
                previous_row[right] + 1,
                current_row[right - 1] + 1,
                previous_row[right - 1] + replace_cost,
            )
        previous_row = current_row
    return previous_row[current_len]
