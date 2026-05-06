# Milestone 3 — Forced Alignment

> **Goal**: Given `voice.wav` + `transcript.txt`, produce per-sentence and per-word timestamps using WhisperX in `align()` mode. Cache aggressively. Display the aligned transcript in the UI.

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T3.1 | Sentence segmentation | 60 min |
| T3.2 | WhisperX wrapper | 90 min |
| T3.3 | Forced alignment endpoint | 60 min |
| T3.4 | Alignment cache | 60 min |
| T3.5 | Transcript display in UI | 90 min |

---

## T3.1 — Sentence segmentation

### Goal
A pure-Python function that takes a plain-text transcript and returns a list of sentences with stable character offsets. Robust to common abbreviations.

### Behavior
- Input: `str` (the full transcript).
- Output: `list[Sentence]` where `Sentence = { index: int, text: str, char_start: int, char_end: int }`.
- Use NLTK Punkt tokenizer with an English-tuned override list:
  - `Mr.`, `Mrs.`, `Dr.`, `Ms.`, `Jr.`, `Sr.`, `Inc.`, `Ltd.`, `Co.`, `vs.`, `etc.`, `e.g.`, `i.e.`
- Trim leading/trailing whitespace per sentence; collapse internal whitespace runs to single spaces.
- Empty paragraphs do not produce empty sentences.
- One-time NLTK data download at first run; cache under `~/.videocreator/nltk_data` (set `NLTK_DATA` env var).

### Files
- `apps/server/server/pipeline/chunker.py` — implement `segment(text: str) -> list[Sentence]`.
- `apps/server/server/domain/timing.py` — define `Sentence` (Pydantic model).

### Tests
`apps/server/tests/test_chunker.py`:
```python
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
        assert text[s.char_start:s.char_end].strip().rstrip(".!?") in s.text
```

### Verification
```powershell
pnpm -F @vc/server test
```

### Commit
```
feat(server): sentence segmentation with abbreviation overrides

Refs: T3.1
```

---

## T3.2 — WhisperX wrapper

### Goal
A thin Python module that loads WhisperX `large-v3` and exposes `align(audio_path, reference_text, language="en") -> AlignmentResult`. Auto-detects CUDA. Loads model lazily and caches in module scope.

### Behavior
- Use `whisperx.load_align_model(language_code, device)` for the alignment model (this is the wav2vec2 phonetic aligner, **not** the ASR model).
- Use `whisperx.align(transcript, model, metadata, audio, device, return_char_alignments=False)`.
- Reference text must be split into "segments" matching what WhisperX expects: `list[{ "start": 0, "end": placeholder, "text": sentence_text }]`. The aligner replaces start/end with real timestamps.
- Output: `AlignmentResult` (Pydantic) with:
  - `sentences: list[{ index, text, start_s, end_s, confidence_avg }]`
  - `words: list[{ sentence_index, text, start_s, end_s, confidence }]`

### Files
- `apps/server/server/pipeline/transcribe.py` — implement `align()`. Handle CUDA OOM by falling back to chunked processing (split audio into 60-sec chunks, align each, merge timestamps).
- `apps/server/server/domain/timing.py` — extend with `AlignmentResult`.

### Test
- Unit test of the result shape with a tiny mock — full integration in T3.3.

### Verification
```powershell
& apps/server/.venv/Scripts/python -c "from server.pipeline.transcribe import align; print('importable')"
```
Prints `importable`.

### Common failures
- **`No such file: model.bin`**: WhisperX downloads on first use. Allow network access for first run.
- **CUDA OOM** on long audio: use chunked path. `large-v3` align model needs ~3 GB VRAM; should fit on 5070 Ti.

### Commit
```
feat(server): WhisperX align() wrapper with CUDA detection

Refs: T3.2
```

---

## T3.3 — Forced alignment endpoint

### Goal
`POST /projects/<id>/align` runs WhisperX on the project's `voice.wav` + `transcript.txt`, writes `.vc/alignment.json`, and returns the alignment.

### Behavior
- Reads `project.json`. Resolves `audio` and `transcript.path` to absolute paths.
- Reads transcript, runs `chunker.segment()`.
- Runs `transcribe.align()` with the sentences as reference.
- Writes `.vc/alignment.json` (the `AlignmentResult`).
- Writes `.vc/alignment.hash` (sha256 of voice file bytes + transcript text).
- Returns the alignment JSON.
- Long-running: runs in `asyncio.to_thread` so the HTTP loop is not blocked. Single-flight per project (concurrent calls to the same project return 409).

### API errors
- `404` if project or voice/transcript missing.
- `409` if alignment already in progress.
- `422` if transcript appears to mismatch audio significantly (alignment confidence < 0.3 average).

### Files
- `apps/server/server/routes/alignment.py` — endpoint.
- `apps/server/server/pipeline/cache.py` — hash helpers (used by both alignment and clip caches).

### Test (integration, slow — gated on env var)
`apps/server/tests/test_alignment_integration.py`:
```python
import os
import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("VC_INTEGRATION") != "1",
    reason="Set VC_INTEGRATION=1 to run model integration tests",
)

# ... uses the smoke project at tests/fixtures/smoke-project/ ...
```

### Verification

Manual smoke test (the canonical one):
1. Create a project, drop in a 30-sec wav and matching transcript.
2. POST to `/projects/<id>/align`.
3. ≤ 60 sec on CUDA, ≤ 3 min on CPU.
4. `.vc/alignment.json` exists and parses; sentences have plausible timestamps.

### Commit
```
feat(server): /align endpoint with single-flight and confidence check

Refs: T3.3
```

---

## T3.4 — Alignment cache

### Goal
`POST /projects/<id>/align` returns cached result if `(voice file content, transcript text)` hash matches `.vc/alignment.hash`. New flag `?force=true` re-runs.

### Behavior
- Hash key: `sha256(voice_file_bytes_streamed + b"\n---\n" + transcript_bytes)`.
- On cache hit: return cached JSON directly, do not load WhisperX.
- On cache miss: re-run, write new hash + alignment.
- On `?force=true`: always re-run.
- Add a `cache_hit: bool` field to the API response.

### Files
- Edit `apps/server/server/pipeline/cache.py` — add `compute_alignment_hash()`.
- Edit `apps/server/server/routes/alignment.py` — wire cache.

### Verification
1. First call: takes the full alignment time, response shows `cache_hit: false`.
2. Second call (no changes): < 1 second, `cache_hit: true`.
3. Edit transcript, re-call: full time, `cache_hit: false`.
4. `?force=true`: full time even with no changes.

### Commit
```
feat(server): alignment result cache with content hash

Refs: T3.4
```

---

## T3.5 — Transcript display in UI

### Goal
The editor page shows the transcript as a vertical list of sentences. Each sentence shows its 1-based index and timestamp in `MM:SS.s` format. A button "Run Alignment" triggers `/align` and shows progress. After completion, sentences populate.

### Behavior
- If no `alignment.json` exists, show "No alignment yet" + button.
- During alignment: button disabled, spinner, status text.
- On error: red banner with the message.
- Each sentence is selectable (single click) and multi-selectable (shift-click for range, ctrl-click for toggle). Selection is local UI state (used in M5).
- Sentence rows: hover highlights the corresponding waveform region (M4 will add the waveform).

### Files
- `apps/web/app/projects/[id]/page.tsx` — main editor layout.
- `apps/web/components/transcript-panel/TranscriptPanel.tsx`.
- `apps/web/lib/hooks/useAlignment.ts` — fetch/poll alignment state.

### Verification

Manual:
1. Open a project with voice + transcript but no alignment.
2. Click "Run Alignment".
3. After completion, sentences appear with timestamps.
4. Click a sentence → it highlights.
5. Shift-click another → contiguous range highlights.
6. Reload page → alignment persists; selections cleared.

### Commit
```
feat(web): transcript panel with alignment trigger and sentence selection

Refs: T3.5
```

---

## Milestone 3 verification

End-to-end:

1. Create a project with a real 2-min voice clip + matching transcript.
2. Run alignment from the UI.
3. Confirm:
   - Alignment completes within budget (90 sec CUDA / 5 min CPU).
   - `.vc/alignment.json` is well-formed.
   - All sentences appear in the UI with plausible timestamps.
   - Re-running is instant (cache hit).
   - Editing the transcript invalidates the cache.

When all pass, mark M3 complete. Move to `05_MILESTONE_PREVIEW.md`.
