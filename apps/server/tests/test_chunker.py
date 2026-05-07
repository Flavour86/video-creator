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
