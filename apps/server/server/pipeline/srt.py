"""SRT subtitle generation from word-level alignment."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from server.domain.timing import AlignedWord, AlignmentResult

MAX_LINE_CHARS = 42
MAX_CUE_LINES = 2
MAX_CUE_CHARS = MAX_LINE_CHARS * MAX_CUE_LINES
MAX_CUE_SECONDS = 7.0

SENTENCE_PUNCTUATION = (".", "!", "?")
CLAUSE_PUNCTUATION = (",", ";", ":")


@dataclass(frozen=True)
class _Cue:
    words: list[AlignedWord]


def generate_srt(alignment: AlignmentResult) -> str:
    cues = _build_cues(alignment)
    blocks = [
        "\r\n".join(
            [
                str(index),
                (
                    f"{_format_timestamp(cue.words[0].start_s)} "
                    f"--> {_format_timestamp(cue.words[-1].end_s)}"
                ),
                *_wrap_text(_words_text(cue.words)),
            ]
        )
        for index, cue in enumerate(cues, start=1)
    ]
    return "\r\n\r\n".join(blocks) + ("\r\n" if blocks else "")


def write_srt(project_dir: Path, alignment: AlignmentResult) -> Path:
    srt_path = project_dir / ".vc" / "subtitles.srt"
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text(generate_srt(alignment), encoding="utf-8", newline="")
    return srt_path


def _build_cues(alignment: AlignmentResult) -> list[_Cue]:
    cues: list[_Cue] = []
    for sentence in alignment.sentences:
        words = [
            word
            for word in alignment.words
            if word.sentence_index == sentence.index and word.text.strip()
        ]
        start = 0
        while start < len(words):
            end = _best_chunk_end(words, start)
            cues.append(_Cue(words=words[start:end]))
            start = end
    return cues


def _best_chunk_end(words: list[AlignedWord], start: int) -> int:
    limit = start + 1
    for index in range(start + 1, len(words) + 1):
        chunk = words[start:index]
        duration_s = chunk[-1].end_s - chunk[0].start_s
        if duration_s > MAX_CUE_SECONDS or not _fits_cue(chunk):
            break
        limit = index

    if limit == len(words):
        return limit

    for punctuation in (SENTENCE_PUNCTUATION, CLAUSE_PUNCTUATION):
        for index in range(limit - 1, start, -1):
            if words[index - 1].text.rstrip().endswith(punctuation):
                return index

    return limit


def _fits_cue(words: list[AlignedWord]) -> bool:
    text = _words_text(words)
    if len(text) > MAX_CUE_CHARS:
        return False
    lines = _wrap_text(text)
    return len(lines) <= MAX_CUE_LINES and all(len(line) <= MAX_LINE_CHARS for line in lines)


def _wrap_text(text: str) -> list[str]:
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= MAX_LINE_CHARS or not current:
            current = candidate
            continue
        lines.append(current)
        current = word

    if current:
        lines.append(current)

    return lines


def _words_text(words: list[AlignedWord]) -> str:
    return " ".join(word.text.strip() for word in words if word.text.strip())


def _format_timestamp(seconds: float) -> str:
    millis = round(max(seconds, 0.0) * 1000)
    hours, remainder = divmod(millis, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, ms = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{ms:03}"
