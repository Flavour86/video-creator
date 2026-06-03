from __future__ import annotations

import re

from server.domain.timing import AlignedSentence, AlignedWord, AlignmentResult
from server.pipeline.srt import alignment_with_sentence_text_overrides, generate_srt, write_aligned_srt_file


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


def test_long_cjk_token_is_split_into_readable_timed_cues() -> None:
    text = (
        "我相信每一个在中国读过书的人都知道这样一句话我们是社会主义国家"
        "社会主义是比资本主义更加先进的制度资本主义制造剥削制造不平等"
        "最终一定会走向灭亡这句话说了几十年"
    )
    alignment = AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text=text,
                start_s=0.031,
                end_s=19.640,
                confidence_avg=0.5,
            )
        ],
        words=[
            AlignedWord(
                sentence_index=1,
                text=text,
                start_s=0.031,
                end_s=19.640,
                confidence=0.5,
            )
        ],
    )

    blocks = _blocks(generate_srt(alignment))

    assert len(blocks) > 1
    assert "".join("".join(block[2:]) for block in blocks) == text
    for block in blocks:
        start, end = block[1].split(" --> ")
        assert _seconds(end) - _seconds(start) <= 7.0
        assert all(len(line) <= 42 for line in block[2:])
        assert len(block[2:]) <= 2


def test_aligned_cjk_characters_render_without_inserted_spaces() -> None:
    text = "劳动者没有议价能力"
    alignment = AlignmentResult(
        sentences=[
            AlignedSentence(
                index=1,
                text=text,
                start_s=0.0,
                end_s=4.5,
                confidence_avg=0.9,
            )
        ],
        words=[
            AlignedWord(
                sentence_index=1,
                text=character,
                start_s=index * 0.5,
                end_s=(index + 1) * 0.5,
                confidence=0.9,
            )
            for index, character in enumerate(text)
        ],
    )

    rendered_text = "".join("".join(block[2:]) for block in _blocks(generate_srt(alignment)))

    assert rendered_text == text
    assert " " not in rendered_text


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


def test_generate_srt_prefers_transcript_sentence_override_text() -> None:
    original = _alignment()
    overridden = alignment_with_sentence_text_overrides(
        original,
        [
            {
                "index": 1,
                "text": "Edited intro.",
                "start_s": 0.0,
                "end_s": 1.2,
                "confidence_avg": 0.95,
            }
        ],
    )

    srt = generate_srt(overridden)
    first_block = _blocks(srt)[0]
    assert first_block[1] == "00:00:00,000 --> 00:00:01,200"
    assert "Edited intro." in first_block[2]
    assert "Short intro." not in srt


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
