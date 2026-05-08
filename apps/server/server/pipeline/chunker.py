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
    tok = _get_tokenizer()
    result: list[Sentence] = []
    idx = 1
    for start, end in tok.span_tokenize(text):
        raw = text[start:end]
        clean = re.sub(r"\s+", " ", raw).strip()
        if not clean:
            continue
        result.append(Sentence(index=idx, text=clean, char_start=start, char_end=end))
        idx += 1
    return result
