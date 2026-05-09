from pathlib import Path

import pytest

from server.pipeline.chunker import segment


def test_basic():
    sents = segment("Hello. World!")
    assert [s.text for s in sents] == ["Hello.", "World!"]


def test_abbreviations():
    sents = segment("Mr. Smith arrived. He was late.")
    assert len(sents) == 2
    assert "Mr. Smith" in sents[0].text


def test_empty_paragraphs():
    sents = segment("First.\n\n\nSecond.")
    assert len(sents) == 2


def test_offsets_are_consistent():
    text = "Hello. World!"
    for s in segment(text):
        assert text[s.char_start : s.char_end].strip().rstrip(".!?") in s.text


def test_cjk_transcripts_strip_markdown_noise_and_segment_sentences():
    text = """## 第一部分：什么是资本主义

资本主义会制造增长。它也会制造危机！

### 优点
1. 周期性的金融危机
当泡沫破裂时，社会会付出代价。普通人也会受影响？
"""

    sents = segment(text)

    assert [s.text for s in sents] == [
        "资本主义会制造增长。",
        "它也会制造危机！",
        "当泡沫破裂时，社会会付出代价。",
        "普通人也会受影响？",
    ]
    assert all(not s.text.startswith(("#", "1.")) for s in sents)


def test_test01_transcript_segments_into_real_sentences():
    fixture = Path(__file__).resolve().parents[3] / "projects" / "test01" / "transcript.txt"
    if not fixture.is_file():
        pytest.skip("projects/test01 fixture is not available in this checkout")

    sents = segment(fixture.read_text(encoding="utf-8"))

    assert len(sents) >= 20
    assert all(not s.text.startswith(("##", "###", "1. ", "2. ", "3. ")) for s in sents)
