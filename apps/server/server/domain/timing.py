"""Timing-related domain models."""
from __future__ import annotations

from pydantic import BaseModel


class Sentence(BaseModel):
    index: int
    text: str
    char_start: int
    char_end: int


class AlignedWord(BaseModel):
    sentence_index: int
    text: str
    start_s: float
    end_s: float
    confidence: float


class AlignedSentence(BaseModel):
    index: int
    text: str
    start_s: float
    end_s: float
    confidence_avg: float


class AlignmentResult(BaseModel):
    sentences: list[AlignedSentence]
    words: list[AlignedWord]
    cache_hit: bool = False
