"""Content-hash helpers for alignment and clip caches."""
from __future__ import annotations

import hashlib
from pathlib import Path


def compute_alignment_hash(audio_path: Path, transcript_text: str) -> str:
    """Return hex sha256 of audio bytes + separator + transcript bytes."""
    h = hashlib.sha256()
    with audio_path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    h.update(b"\n---\n")
    h.update(transcript_text.encode("utf-8"))
    return h.hexdigest()
