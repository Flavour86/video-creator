"""SRT subtitle generation from word-level alignment."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from server.domain.timing import AlignedWord, AlignmentResult

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


@dataclass(frozen=True)
class SubtitleStats:
    cue_count: int
    total_duration_s: float


@dataclass(frozen=True)
class SubtitleAlignmentUpdate:
    corrections_applied: int
    cue_count: int


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
        words = [
            readable_word
            for word in alignment.words
            if word.sentence_index == sentence.index and word.text.strip()
            for readable_word in _split_oversized_word(
                word,
                max_line_chars=max_line_chars,
            )
        ]
        start = 0
        while start < len(words):
            end = _best_chunk_end(words, start, max_line_chars=max_line_chars)
            cues.append(_Cue(words=words[start:end]))
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
            math.floor(len(text) * (MAX_CUE_SECONDS - 0.001) / duration_s),
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
        end = min(len(text), start + chunk_limit)
        if end < len(text):
            earliest_break = start + max(1, chunk_limit // 2)
            for candidate in range(end, earliest_break - 1, -1):
                if text[candidate - 1] in BREAK_PUNCTUATION:
                    end = candidate
                    break
        chunks.append(text[start:end])
        start = end
    return chunks


def _normalized_cue_spans(cues: list[_Cue]) -> list[tuple[float, float]]:
    spans = [(cue.words[0].start_s, cue.words[-1].end_s) for cue in cues if cue.words]
    normalized: list[tuple[float, float]] = []
    for index, (start_s, end_s) in enumerate(spans):
        next_start = spans[index + 1][0] if index + 1 < len(spans) else None
        next_end = end_s
        if next_start is not None and next_end < next_start:
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
    if len(text) > max_cue_chars:
        return False
    lines = _wrap_text(text, max_line_chars=max_line_chars)
    return len(lines) <= MAX_CUE_LINES and all(len(line) <= max_line_chars for line in lines)


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
        if len(candidate) <= max_line_chars or not current:
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
    blocks = [block for block in content.replace("\r\n", "\n").split("\n\n") if block.strip()]
    cues: list[tuple[str, str]] = []
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if len(lines) < 2:
            continue
        timing = lines[1]
        text = " ".join(lines[2:]).strip()
        cues.append((timing, text))
    return cues


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
