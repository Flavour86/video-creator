# Smoke Project Fixture

Used by `test_alignment_integration.py` (T3.3). Requires `VC_INTEGRATION=1`.

Place a real `voice.wav` (≥10 s, matching the transcript) here before running integration tests.
The file is intentionally excluded from git (too large). Generate one with:

```powershell
ffmpeg -f lavfi -i "sine=frequency=440:duration=10" -ar 16000 -ac 1 voice.wav
```
