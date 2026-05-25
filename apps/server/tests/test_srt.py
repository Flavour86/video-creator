from __future__ import annotations

import re

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult
from server.pipeline.srt import generate_srt, write_aligned_srt_file


def _alignment() -> AlignmentResult:
    sentences = [
        AlignedSentence(
            index=1,
            text="Short intro.",
            start_s=0.0,
            end_s=1.2,
            confidence_avg=0.95,
        ),
        AlignedSentence(
            index=2,
            text=(
                "This long sentence has enough words to become multiple subtitle cues, "
                "because it must respect readable line lengths and duration limits."
            ),
            start_s=1.3,
            end_s=11.8,
            confidence_avg=0.9,
        ),
        AlignedSentence(
            index=3,
            text="Final thought.",
            start_s=12.0,
            end_s=13.3,
            confidence_avg=0.92,
        ),
    ]
    words = [
        AlignedWord(sentence_index=1, text="Short", start_s=0.0, end_s=0.5, confidence=0.9),
        AlignedWord(sentence_index=1, text="intro.", start_s=0.5, end_s=1.2, confidence=0.9),
    ]
    long_words = (
        "This long sentence has enough words to become multiple subtitle cues, "
        "because it must respect readable line lengths and duration limits."
    ).split()
    for offset, word in enumerate(long_words):
        start_s = 1.3 + (offset * 0.65)
        words.append(
            AlignedWord(
                sentence_index=2,
                text=word,
                start_s=start_s,
                end_s=start_s + 0.55,
                confidence=0.9,
            )
        )
    words.extend(
        [
            AlignedWord(sentence_index=3, text="Final", start_s=12.0, end_s=12.6, confidence=0.9),
            AlignedWord(
                sentence_index=3,
                text="thought.",
                start_s=12.6,
                end_s=13.3,
                confidence=0.9,
            ),
        ]
    )
    return AlignmentResult(sentences=sentences, words=words)


def _blocks(srt: str) -> list[list[str]]:
    return [block.split("\r\n") for block in srt.strip().split("\r\n\r\n")]


def test_long_sentence_produces_multiple_cues() -> None:
    blocks = _blocks(generate_srt(_alignment()))

    sentence_two_blocks = [
        block
        for block in blocks
        if float(block[1].split(" --> ")[0].replace(",", ".").rsplit(":", maxsplit=1)[-1]) >= 1.3
    ]

    assert len(blocks) > 3
    assert len(sentence_two_blocks) > 1


def test_no_cue_exceeds_line_or_duration_limits() -> None:
    for block in _blocks(generate_srt(_alignment())):
        start, end = block[1].split(" --> ")
        assert _seconds(end) - _seconds(start) <= 7.0
        assert all(len(line) <= 42 for line in block[2:])
        assert len(block[2:]) <= 2


def test_cue_numbers_are_one_based_and_contiguous() -> None:
    blocks = _blocks(generate_srt(_alignment()))

    assert [int(block[0]) for block in blocks] == list(range(1, len(blocks) + 1))


def test_timestamps_use_srt_format() -> None:
    srt = generate_srt(_alignment())

    assert re.search(r"00:00:00,000 --> 00:00:\d{2},\d{3}", srt)
    assert re.search(r"\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}", srt)


def test_aligned_srt_correction_count_handles_cue_resegmentation(tmp_path) -> None:
    previous_srt = (
        "1\r\n00:00:00,000 --> 00:00:00,500\r\nHello\r\n\r\n"
        "2\r\n00:00:00,500 --> 00:00:01,200\r\nworld.\r\n"
    )
    srt_path = tmp_path / "subtitles.srt"
    srt_path.write_text(previous_srt, encoding="utf-8", newline="")

    update = write_aligned_srt_file(srt_path, _alignment())

    assert update.corrections_applied >= 1
    assert update.corrections_applied < update.cue_count + 2


def test_generate_srt_respects_custom_max_chars_per_line() -> None:
    srt = generate_srt(_alignment(), max_line_chars=30)

    blocks = _blocks(srt)
    for block in blocks:
        assert all(len(line) <= 30 for line in block[2:])
        assert len(block[2:]) <= 2


def test_generate_srt_gap_fills_and_avoids_zero_duration_cues() -> None:
    alignment = AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text="First sentence.",
                start_s=0.0,
                end_s=3.0,
                confidence_avg=0.95,
            ),
            AlignedSentence(
                index=2,
                text="Second sentence.",
                start_s=9.0,
                end_s=9.0,
                confidence_avg=0.9,
            ),
            AlignedSentence(
                index=3,
                text="Third sentence.",
                start_s=12.0,
                end_s=12.8,
                confidence_avg=0.92,
            ),
        ],
        words=[
            AlignedWord(sentence_index=1, text="First", start_s=0.0, end_s=1.2, confidence=0.9),
            AlignedWord(
                sentence_index=1,
                text="sentence.",
                start_s=1.2,
                end_s=3.0,
                confidence=0.9,
            ),
            AlignedWord(
                sentence_index=2,
                text="Second",
                start_s=9.0,
                end_s=9.0,
                confidence=0.9,
            ),
            AlignedWord(
                sentence_index=2,
                text="sentence.",
                start_s=9.0,
                end_s=9.0,
                confidence=0.9,
            ),
            AlignedWord(
                sentence_index=3,
                text="Third",
                start_s=12.0,
                end_s=12.4,
                confidence=0.9,
            ),
            AlignedWord(
                sentence_index=3,
                text="sentence.",
                start_s=12.4,
                end_s=12.8,
                confidence=0.9,
            ),
        ],
    )

    blocks = _blocks(generate_srt(alignment))
    ranges = [block[1].split(" --> ") for block in blocks]

    assert ranges[0][1] == ranges[1][0]
    assert _seconds(ranges[1][1]) > _seconds(ranges[1][0])


def _seconds(timestamp: str) -> float:
    hours, minutes, rest = timestamp.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000
