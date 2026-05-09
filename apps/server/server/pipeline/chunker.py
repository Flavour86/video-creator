"""Sentence segmentation using NLTK Punkt tokenizer."""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import cast

import nltk  # type: ignore[import-untyped]

from server.domain.timing import Sentence

_NLTK_DIR = Path(os.environ.get("NLTK_DATA", str(Path.home() / ".videocreator" / "nltk_data")))
_EXTRA_ABBREVS = {
    "mr",
    "mrs",
    "dr",
    "ms",
    "jr",
    "sr",
    "inc",
    "ltd",
    "co",
    "vs",
    "etc",
    "e.g",
    "i.e",
}
_tokenizer: nltk.tokenize.PunktSentenceTokenizer | None = None
_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]")
_CJK_SENTENCE_RE = re.compile(r"[^。！？；…\n]+(?:[。！？；…]+|(?=\n|$))")
_NOISE_LINE_RE = re.compile(r"^\s*(?:#{1,6}\s|\d+\.\s|[-*_]{3,}\s*$)")
_QUOTE_CHARS = "\"“”「」『』"


def _get_tokenizer() -> nltk.tokenize.PunktSentenceTokenizer:
    global _tokenizer
    if _tokenizer is not None:
        return _tokenizer

    os.environ.setdefault("NLTK_DATA", str(_NLTK_DIR))
    if str(_NLTK_DIR) not in nltk.data.path:
        nltk.data.path.insert(0, str(_NLTK_DIR))

    tok: nltk.tokenize.PunktSentenceTokenizer | None = None
    for corpus, model_path in [
        ("punkt_tab", "tokenizers/punkt_tab/english.pickle"),
        ("punkt", "tokenizers/punkt/english.pickle"),
    ]:
        try:
            nltk.data.find(f"tokenizers/{corpus}")
            tok = cast(nltk.tokenize.PunktSentenceTokenizer, nltk.data.load(model_path))
            break
        except LookupError:
            pass

    if tok is None:
        _NLTK_DIR.mkdir(parents=True, exist_ok=True)
        nltk.download("punkt_tab", download_dir=str(_NLTK_DIR), quiet=True)
        tok = cast(
            nltk.tokenize.PunktSentenceTokenizer,
            nltk.data.load("tokenizers/punkt_tab/english.pickle"),
        )

    tok._params.abbrev_types.update(_EXTRA_ABBREVS)
    _tokenizer = tok
    return tok


def segment(text: str) -> list[Sentence]:
    """Split text into sentences with character offsets."""
    cleaned_text, offset_map = _clean_transcript(text)
    if not cleaned_text.strip():
        return []

    spans = (
        _cjk_sentence_spans(cleaned_text)
        if _CJK_RE.search(cleaned_text)
        else list(_get_tokenizer().span_tokenize(cleaned_text))
    )
    result: list[Sentence] = []
    idx = 1
    for start, end in spans:
        raw = cleaned_text[start:end]
        clean = re.sub(r"\s+", " ", raw).strip().strip(_QUOTE_CHARS).strip()
        if not clean:
            continue
        result.append(
            Sentence(
                index=idx,
                text=clean,
                char_start=offset_map[start],
                char_end=offset_map[end - 1] + 1,
            )
        )
        idx += 1
    return result


def _clean_transcript(text: str) -> tuple[str, list[int]]:
    """Remove structural transcript noise before sentence segmentation.

    Markdown heading lines (``#`` through ``###``) and ordered-list heading
    lines (``1. ``) are omitted. Remaining paragraph edges have wrapping
    straight or CJK quote pairs stripped so the returned sentences start with
    spoken text instead of document scaffolding.
    """
    cleaned: list[str] = []
    offsets: list[int] = []
    cursor = 0

    for line in text.splitlines(keepends=True):
        raw_body = line.rstrip("\r\n")
        newline = line[len(raw_body) :]
        body = raw_body
        if body.strip() and not _NOISE_LINE_RE.match(body):
            start = len(body) - len(body.lstrip())
            end = len(body.rstrip())
            while start < end and body[start] in _QUOTE_CHARS:
                start += 1
            while end > start and body[end - 1] in _QUOTE_CHARS:
                end -= 1
            for local_index in range(start, end):
                if body[local_index] == "*":
                    continue
                cleaned.append(body[local_index])
                offsets.append(cursor + local_index)
        if newline and cleaned and cleaned[-1] != "\n":
            cleaned.append("\n")
            offsets.append(cursor + len(body))
        cursor += len(line)

    return "".join(cleaned), offsets


def _cjk_sentence_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for match in _CJK_SENTENCE_RE.finditer(text):
        start, end = match.span()
        if text[start:end].strip():
            spans.append((start, end))
    return spans
