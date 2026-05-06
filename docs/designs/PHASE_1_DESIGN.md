# Video Creator — Phase 1 Design

> **Status**: Specification, pre-scaffold.
> **Owner**: Dianen.
> **Date**: 2026-05-06.

---

## 1. Vision & Three-Phase Roadmap

A solo-built, AI-augmented video creator. Built local-first, productized later.

| Phase | Scope | Compute | Goal |
|---|---|---|---|
| **1** | Local-only. User provides voice + transcript + images/clips → tool composes a YouTube-ready 1080p MP4. | Local CPU + GPU (WhisperX only). No cloud. | Working v1, $0/render. |
| **2** | Add character-consistent AI video (image gen, image-to-video, custom LoRA training/inference). | **All AI workloads on online serverless GPU** (Fal Custom Deployment / Modal). Local machine stays free. | Premium output; deep AI/ML learning. |
| **3** | Productize as multi-tenant SaaS once Phase 1+2 prove out and YouTube revenue justifies it. | Cloud-deployed. | Monetize. |

**Architectural principle**: Phase 1 ships standalone. Phase 2 adds an AI provider adapter that lives entirely outside the local box. Phase 3 changes deployment, not architecture.

---

## 2. Phase 1 Scope

### In scope
- Local web app launched via `npx`, opens browser at `localhost`.
- Self-contained per-project folders on the user's disk.
- Sentence-level transcript anchoring, with multi-sentence concatenation and timestamp overrides.
- Multi-layer composition: black fallback → auto-distribute → multi-foreground stack → subtitles → watermark.
- Foreground compositing modes: full-screen replace, picture-in-picture (PiP).
- Per-boundary transitions: cut, fade, slide.
- Subtitles: always-emit `.srt`; optional burn-in.
- Two render presets: Draft (720p, ultrafast) and Final (1080p, CRF 18).
- In-browser live preview (no ffmpeg invocation for scrubbing).
- Asset-level render cache for fast iteration.
- WhisperX forced alignment using transcript as reference text (CUDA when available, CPU fallback).

### Out of scope (deferred)
- AI image / video generation → Phase 2.
- TTS (text-to-speech voice generation) → Phase 2 / 3.
- LoRA training and character consistency → Phase 2.
- Background music / sound effects → Phase 3.
- Multi-aspect rendering (9:16 Shorts, 1:1) → v1.5.
- Subtitle style customization → Phase 3.
- Multi-tenant / accounts / billing → Phase 3.
- Cross-project media library → v1.5.
- HDR output → never.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js 15 + React 19 + TypeScript** | App Router, server components for project list. |
| Styling | **Tailwind CSS + shadcn/ui** | |
| Timeline waveform | **WaveSurfer.js** | |
| Backend | **FastAPI + Python 3.11** | Sidecar started as subprocess by `next dev`. |
| Async backend tasks | **FastAPI BackgroundTasks** + asyncio | No external queue in v1. |
| IPC | HTTP + WebSocket on `localhost` | WebSocket carries render progress. |
| Forced alignment | **WhisperX** (`whisperx.align()` mode, `large-v3`) | Reference text from transcript; CUDA if available. |
| Video composition | **ffmpeg** (`ffmpeg-python` for Python bindings, raw filtergraph for complex chains) | |
| Project DB | **SQLite** | One global app DB. Project metadata is JSON-on-disk. |
| Run model | `npx @yourname/video-creator` | Boots both servers, opens browser. |

### Why Next.js + FastAPI (not Tauri / Electron / Gradio)
- Phase 2 mandates Python (WhisperX, diffusers, training scripts). Embracing Python now avoids a rewrite.
- Phase 3 productizes naturally: Next.js → Vercel; FastAPI → Modal/Fly. No rework.
- A web UI is the right surface for a multi-layer timeline editor. Gradio cannot do this.
- Tauri/Electron desktop wrappers throw away the UI in Phase 3.

---

## 4. Repository Structure

Monorepo with `pnpm` workspaces.

```
video-creator/
├── package.json                    # workspace root, scripts to boot both servers
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .nvmrc                          # Node 22
├── .python-version                 # 3.11
├── README.md
│
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── package.json
│   │   ├── next.config.ts
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # project list / new project
│   │   │   ├── projects/[id]/
│   │   │   │   ├── page.tsx        # editor
│   │   │   │   ├── timeline/       # custom timeline component
│   │   │   │   └── render/         # render dialog + progress
│   │   │   └── api/                # thin Next route handlers proxying to FastAPI
│   │   ├── components/
│   │   │   ├── transcript-panel/
│   │   │   ├── timeline-strip/
│   │   │   ├── media-library/
│   │   │   ├── preview-player/     # WaveSurfer + image overlay
│   │   │   └── render-status/
│   │   ├── lib/
│   │   │   ├── api-client.ts       # typed fetch to FastAPI
│   │   │   ├── ws-client.ts        # WebSocket for render progress
│   │   │   └── project-schema.ts   # zod schemas for project.json
│   │   └── styles/
│   │
│   └── server/                     # FastAPI backend
│       ├── pyproject.toml
│       ├── server/
│       │   ├── __init__.py
│       │   ├── main.py             # FastAPI app, route registration
│       │   ├── settings.py
│       │   ├── routes/
│       │   │   ├── projects.py
│       │   │   ├── media.py
│       │   │   ├── alignment.py
│       │   │   ├── render.py
│       │   │   └── ws.py           # render-progress WebSocket
│       │   ├── domain/
│       │   │   ├── project.py      # Pydantic project.json model
│       │   │   ├── layers.py
│       │   │   └── timing.py
│       │   ├── pipeline/
│       │   │   ├── transcribe.py   # WhisperX align wrapper
│       │   │   ├── chunker.py      # sentence + subtitle chunker
│       │   │   ├── filtergraph.py  # builds ffmpeg filter chain from project.json
│       │   │   ├── render.py       # invokes ffmpeg, streams progress
│       │   │   ├── cache.py        # asset cache (hash → cached clip)
│       │   │   └── srt.py
│       │   └── adapters/
│       │       └── ai/             # placeholder for Phase 2 (provider interface)
│       │           └── base.py     # abstract AIProvider class
│       ├── tests/
│       └── scripts/
│           ├── setup-gpu.ps1       # Blackwell-aware install
│           └── setup-cpu.sh
│
├── packages/
│   └── shared-schemas/             # JSON schema for project.json, shared TS + Python
│       ├── project.schema.json
│       ├── ts/
│       │   └── index.ts            # generated TS types
│       └── py/
│           └── schemas.py          # generated Pydantic models
│
└── .github/
    └── workflows/
        └── ci.yml
```

Build commands:
- `pnpm dev` → starts FastAPI on `:8787` and Next.js on `:3000` concurrently.
- `pnpm build` → builds Next.js + bundles Python via PyInstaller (for distributable later).
- `pnpm test` → runs Vitest + pytest.

---

## 5. Per-Project Folder Layout

Each video project is a self-contained folder. Portable. Zip-and-share friendly.

```
my-tokyo-essay/                     # user picks this location
├── project.json                    # canonical scene spec (see §6)
├── transcript.txt                  # plain text input (or transcript.json if pre-segmented)
├── voice.wav                       # voice input (mono or stereo, 16/24-bit, ≥44.1 kHz)
├── media/
│   ├── tokyo-skyline.jpg
│   ├── intro-clip.mp4
│   └── logo.png
├── renders/
│   ├── draft-2026-05-06-1403.mp4
│   └── final-2026-05-06-1530.mp4
└── .vc/                            # tool-managed cache, gitignorable
    ├── alignment.json              # WhisperX output for current voice+transcript hash
    ├── alignment.hash              # hash of (voice + transcript) inputs
    ├── subtitles.srt               # generated SRT
    ├── thumbs/                     # 256×144 PNG thumbnails per media file
    └── clips/                      # cached scene clips, hash-keyed
        └── 8a3f2c....mp4
```

### Global app state
`%APPDATA%\videocreator\app.db` (Windows) / `~/.videocreator/app.db` (Unix). SQLite. Tables:
- `recent_projects(path, last_opened_at)`
- `app_settings(key, value)` — default render preset, etc.
- `render_history(project_path, output_path, preset, started_at, finished_at, duration_s, status)`

### Media ingest model
- Drag/drop → file is **copied** into `media/` (default).
- Toggle "Reference in place" → store absolute path; safer for huge files but breaks if user moves the source.
- Files pre-placed in `media/` auto-discovered on project open.
- Single-project-at-a-time: switch via Recent Projects menu.

---

## 6. `project.json` Schema

Authoritative scene specification. Hand-editable; UI is a generator.

```jsonc
{
  "version": 1,
  "name": "Tokyo Essay",
  "created_at": "2026-05-06T14:00:00Z",
  "updated_at": "2026-05-06T15:30:00Z",

  "audio": "voice.wav",
  "transcript": {
    "kind": "plain_text" /* | "pre_segmented" */,
    "path": "transcript.txt"
  },

  "output": {
    "preset": "final" /* | "draft" */,
    "resolution": "1920x1080",
    "fps": 30,
    "video_codec": "h264",
    "video_crf": 18,
    "preset_name": "slow" /* x264 preset */,
    "pixel_format": "yuv420p",
    "audio_codec": "aac",
    "audio_bitrate_kbps": 192,
    "audio_sample_rate": 48000,
    "container": "mp4",
    "color_space": "bt709"
  },

  "layers": {
    "auto_distribute": {
      "kind": "images" /* | "clips" | "single_image" | "none" */,
      "items": ["bg-1.jpg", "bg-2.jpg", "bg-3.jpg"],
      "transition": "crossfade" /* | "cut" */,
      "transition_duration_s": 0.4
    },

    "foreground": [
      {
        "id": "fg-001",
        "z": 1,
        "anchor": "transcript",
        "sentences": [5, 6, 7],
        "media": "tokyo-skyline.jpg",
        "compositing": "fullscreen",
        "motion": {
          "kind": "ken_burns",
          "from": { "scale": 1.0, "x": 0.5, "y": 0.5 },
          "to":   { "scale": 1.15, "x": 0.55, "y": 0.45 },
          "easing": "ease_in_out"
        },
        "transition_in":  { "kind": "fade", "duration_s": 0.4 },
        "transition_out": { "kind": "cut" }
      },
      {
        "id": "fg-002",
        "z": 2,
        "anchor": "time",
        "from": "00:01:00.000",
        "to":   "00:01:15.000",
        "media": "callout.png",
        "compositing": {
          "mode": "pip",
          "position": "top-right",
          "offset_x": 32,
          "offset_y": 32,
          "scale": 0.3,
          "border_radius": 12
        },
        "transition_in":  { "kind": "slide", "from": "right", "duration_s": 0.3 },
        "transition_out": { "kind": "fade", "duration_s": 0.3 }
      }
    ]
  },

  "subtitles": {
    "generate_srt": true,
    "burn_in": false,
    "style": "default"  /* Phase 3 expands to a style object */
  },

  "watermark": {
    "image": "logo.png",
    "position": "bottom-right",
    "offset_x": 24,
    "offset_y": 24,
    "scale": 0.08,
    "opacity": 0.6
  }
}
```

### Resolution rule (compositor pseudocode)
```
def display_at(t):
    frame = BLACK
    frame = paint(frame, auto_distribute.at(t))     # Layer 1 over Layer 0
    for fg in sorted(foreground.active_at(t), by=z):
        if fg.compositing == "fullscreen":
            frame = fg.media_at(t)                  # full replace
        else:
            frame = overlay(frame, fg, fg.compositing)
    if subtitles.burn_in:
        frame = burn(frame, subtitles.cue_at(t))
    if watermark:
        frame = overlay(frame, watermark)
    return frame
```

JSON Schema is published in `packages/shared-schemas/project.schema.json` and code-generated into TS types and Pydantic models so frontend and backend stay in lockstep.

---

## 7. Layered Composition Model

```
LAYER 4 (top):    Watermark              [global persistent overlay, optional]
LAYER 3:          Subtitles              [optional burn-in]
LAYER 2 (multi):  Foreground stack       [z-order; each item is fullscreen or PiP]
LAYER 1:          Auto-distribute        [single image stretched | N images even | clip sequence]
LAYER 0 (bottom): Black                  [universal fallback, always present]
```

### Auto-distribute behavior
- `kind: "single_image"` — image stretched/centered across full audio duration.
- `kind: "images"` — N images, each gets `audio_duration / N` seconds, in order. Crossfade between by default.
- `kind: "clips"` — clips concatenated. If `Σ clip_durations < audio_duration`, the trailing gap shows the Layer 0 black fallback.
- `kind: "none"` — Layer 0 black is visible wherever foreground is silent.

### Foreground anchoring
- `anchor: "transcript"` — `sentences: [5,6,7]`. Tool resolves to `[start_time, end_time]` from `alignment.json`. **Re-recording the voice does not invalidate the assignment** — only the resolved timestamps change.
- `anchor: "time"` — explicit `from` / `to`. Bypasses alignment.

### Foreground overlap rules
- Items with the same `z` may not overlap in time (validation error).
- Items with different `z` may overlap; higher `z` wins for fullscreen, or composes for PiP.
- A fullscreen item at `z=1` covers a fullscreen item at `z=0`.

### Transitions
- Per-boundary, on each foreground item.
- Kinds: `cut` (zero-duration), `fade` (cross-fade), `slide` (with direction: `left` / `right` / `top` / `bottom`).
- Default: `fade 0.4s` in/out, configurable per-item or globally.

---

## 8. Forced Alignment & Subtitle Pipeline

### Inputs
- `voice.wav` (or .mp3, .flac — re-encoded internally to 16 kHz mono WAV for WhisperX).
- `transcript.txt` (plain text) or `transcript.json` (pre-segmented sentences).

### Pipeline
```
transcript.txt → sentence-segment (Punkt + custom splitter)
voice.wav      → resample to 16 kHz mono
                ↓
        WhisperX align(audio, reference_text, language="en")
                ↓
       word_timestamps[], sentence_timestamps[]
                ↓
              alignment.json (cached)
                ↓
       ┌────────────┴────────────┐
       ↓                          ↓
   subtitles.srt           foreground transcript-anchored items
   (always)                resolve sentences → time ranges
       ↓
   ffmpeg subtitles= filter (only if burn_in=true)
```

### Why force-alignment, not ASR?
The transcript text is **authoritative**. WhisperX's `align()` mode takes a reference text and produces timestamps for those exact words. ASR (`transcribe()`) would re-transcribe and could introduce errors. We never use `transcribe()`.

### Subtitle chunking
Long sentences are split into multiple `.srt` cues:
- ≤ 42 characters per line, ≤ 2 lines per cue.
- ≤ 7 seconds per cue.
- Splits prefer punctuation > clause boundaries > word boundaries; never mid-word.
- Each chunk's start/end pulled from word-level timestamps.

### Caching
- Key: `sha256(voice_file_bytes + transcript_text)`.
- Stored in `.vc/alignment.json` + `.vc/alignment.hash`.
- Invalidated only when voice or transcript changes.

### Device selection
```python
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
```
On RTX 5070 Ti: ~30–60 sec for a 15-min audio. On modern CPU: ~2–5 min.

---

## 9. Render Pipeline (Three Tiers)

### Tier 1 — In-browser preview (always available, no ffmpeg)
- HTML5 `<audio>` plays `voice.wav`.
- WaveSurfer renders waveform with overlaid sentence boundaries and scene markers.
- A `<canvas>` (or stacked `<img>` elements with CSS opacity) shows the current visual based on `display_at(t)` evaluated in JavaScript.
- Watermark = absolutely-positioned `<img>`.
- Subtitles = `<div>` with the cue at current time.
- Approximate (CSS fade ≠ ffmpeg fade) but verifies timing decisions instantly.

### Tier 2 — Asset cache
- For each foreground item, pre-render a clip combining `(media_file, duration, motion, transitions, target_resolution)` to `.vc/clips/<hash>.mp4`.
- Hash key:
  ```
  sha256(media_file_content_hash + duration + motion_spec + transition_in + transition_out + output_resolution + output_fps)
  ```
- Skip if cache hit.
- Format: H.264, all-I-frames (`-g 1 -keyint_min 1`), CRF matching final preset.

### Tier 3 — Final compose
- Single ffmpeg invocation with one filtergraph.
- Inputs: `voice.wav`, every cached clip, `watermark.png`, `subtitles.srt`.
- Filtergraph (conceptual):
  ```
  [0:v] color=black:s=1920x1080:r=30:d=<voice_duration> [bg]
  [bg][1:v] overlay=enable='between(t,t1_start,t1_end)' [tmp1]
  [tmp1][2:v] overlay=enable='...' [tmp2]
  ...
  [tmpN] subtitles=subtitles.srt [withsub]
  [withsub][wm:v] overlay=W-w-24:H-h-24 [out_v]
  [voice:a] aformat=... [out_a]
  ```
- Two presets:

| Preset | Resolution | x264 preset | CRF | Audio | Render time (15-min, M3 / Ryzen 7) |
|---|---|---|---|---|---|
| **Draft** | 1280×720 | `ultrafast` | 28 | AAC 128 kbps | ~3–5 min |
| **Final** | 1920×1080 | `slow` | 18 | AAC 192 kbps | ~10–25 min |

### Progress reporting
- ffmpeg `-progress pipe:1` writes key=value pairs to stdout.
- FastAPI parses `out_time_us`, `frame`, `speed`.
- WebSocket pushes `{ percent, eta_s, current_stage }` to the UI ~5×/sec.

### Render history
After each render: append to `render_history` table in app.db. Show in UI with paths.

---

## 10. Cache Invalidation Rules

| Change | Invalidates |
|---|---|
| Edit `transcript.txt` | `alignment.json` + all transcript-anchored clip caches |
| Replace `voice.wav` | `alignment.json` + all transcript-anchored clip caches |
| Add foreground item | nothing existing |
| Delete foreground item | the deleted item's clip cache |
| Change foreground item's `media`, `duration`, `motion`, or `transitions` | only that item's clip cache |
| Move a foreground item's time range (`from/to`) | nothing in `clips/`; recompose only |
| Change watermark | nothing in `clips/`; recompose only |
| Change subtitle burn-in toggle | nothing in `clips/`; recompose only |
| Change render preset | clip caches regenerated at the new resolution; recompose |

**Rule of thumb**: cache hashes content, not position. Moving stuff in time is free.

---

## 11. Output Specifications

### YouTube 1080p (Final)
| Setting | Value |
|---|---|
| Resolution | 1920 × 1080 |
| Aspect | 16:9 |
| Frame rate | 30 fps |
| Video codec | H.264 (libx264) |
| Pixel format | yuv420p |
| Quality | CRF 18, x264 preset `slow` |
| Color | BT.709 (SDR) |
| Audio codec | AAC |
| Audio bitrate | 192 kbps |
| Audio sample rate | 48 kHz |
| Channels | stereo |
| Container | MP4 with `+faststart` |

### Draft (Preview)
| Setting | Value |
|---|---|
| Resolution | 1280 × 720 |
| Frame rate | 30 fps |
| Quality | CRF 28, x264 preset `ultrafast` |
| Audio | AAC 128 kbps |

Output filename pattern: `<preset>-<YYYY-MM-DD-HHmm>.mp4` in `renders/`.

### Why CRF, not bitrate-targeted
YouTube re-encodes server-side. Constant visual quality matters more than file size.

### Why no HDR
Source materials (still images, ffmpeg motion) don't benefit from HDR. Adds tone-mapping complexity for zero gain.

### Why one aspect ratio in v1
A vertical 9:16 Shorts version is **not** the same project shrunk — every scene needs re-framing decisions (where does the subject sit in the vertical crop?). v1.5 will add per-foreground-item crop hints for vertical re-frame.

---

## 12. Run Model & Installation

### End-user invocation
```
npx @yourname/video-creator
```

This:
1. Downloads/uses cached package.
2. Verifies system dependencies (Node 22+, Python 3.11+, ffmpeg in PATH, optional CUDA).
3. Boots FastAPI sidecar on `127.0.0.1:8787`.
4. Boots Next.js production server on `127.0.0.1:3000`.
5. Opens browser to `http://localhost:3000`.
6. On Ctrl+C: gracefully shuts both down.

### First-run UX
- Detects missing dependencies, prints a clear install command per platform.
- For Blackwell GPUs (RTX 50-series): runs `setup-gpu.ps1` to install correct CUDA-enabled PyTorch wheels.

### Postgres? Redis? Queues?
**No.** Single user, single machine, one render at a time. SQLite + asyncio + filesystem is sufficient.

---

## 13. Dependencies & Setup

### System (host machine)
- **Node.js** ≥ 22
- **Python** 3.11
- **ffmpeg** ≥ 6.0 (with libx264, libfreetype, libass)
- **Git**
- Optional: **CUDA Toolkit** ≥ 12.8 + matching driver for RTX 50-series GPU

### Python (`apps/server/pyproject.toml`)
```toml
[project]
dependencies = [
  "fastapi >=0.110",
  "uvicorn[standard] >=0.27",
  "websockets >=12.0",
  "pydantic >=2.6",
  "ffmpeg-python >=0.2",
  "whisperx >=3.1",          # transitive: torch, faster-whisper, ctranslate2
  "torch >=2.6",             # cu128 wheels for Blackwell
  "soundfile",
  "numpy",
  "nltk",                    # sentence segmentation (Punkt)
]

[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "ruff", "mypy"]
```

Install (Windows, Blackwell GPU):
```powershell
pip install --index-url https://download.pytorch.org/whl/cu128 torch
pip install -e ./apps/server
```

Install (CPU fallback):
```bash
pip install -e ./apps/server
```

### Node (`apps/web/package.json`)
```jsonc
{
  "dependencies": {
    "next": "^15.0",
    "react": "^19.0",
    "react-dom": "^19.0",
    "tailwindcss": "^4.0",
    "wavesurfer.js": "^7.8",
    "zod": "^3.23",
    "zustand": "^4.5",
    "@radix-ui/react-*": "...",
    "lucide-react": "^0.400"
  }
}
```

---

## 14. Build Order (suggested implementation sequence)

**Milestone 1 — Skeleton (1–2 days)**
1. Monorepo init, pnpm workspaces, TS/Python configs, CI.
2. `npx` launcher boots both servers, browser opens.
3. Homepage shows "New Project" / "Open Project" / "Recent".

**Milestone 2 — Project I/O (1 day)**
4. Project create wizard: pick folder, drop voice.wav + transcript.txt → writes `project.json`.
5. Open existing project: read `project.json`, load media list.

**Milestone 3 — Alignment (1 day)**
6. WhisperX align endpoint, cached to `.vc/alignment.json`.
7. UI shows transcript with timestamps inline.

**Milestone 4 — Preview (2–3 days)**
8. WaveSurfer + transcript panel side-by-side.
9. Click sentence to seek audio. Multi-select sentence range.
10. Layer 0 black + Layer 1 auto-distribute (single image only) preview.

**Milestone 5 — Foreground & Render (3–4 days)**
11. Drop image onto sentence range → adds foreground item.
12. Asset cache: pre-render clip per item.
13. Single-pass ffmpeg compose endpoint, Draft preset only.
14. WebSocket render-progress UI.

**Milestone 6 — Polish (3–4 days)**
15. Final preset.
16. Subtitles (SRT + burn-in toggle).
17. Auto-distribute multiple images / clips.
18. Watermark.
19. Time-pinned overrides.
20. PiP compositing.
21. Configurable transitions.

**Total estimated time for solo dev: ~2–3 weeks** to a usable v1 the user trusts for real videos.

---

## 15. Phase 2 Forward-Compatibility

Phase 1 must not paint Phase 2 into a corner. Two specific provisions:

### AI provider adapter
`apps/server/server/adapters/ai/base.py` defines:

```python
class AIProvider(Protocol):
    async def generate_image(self, prompt: str, **kwargs) -> Path: ...
    async def image_to_video(self, image: Path, prompt: str, duration_s: int, **kwargs) -> Path: ...
    async def train_lora(self, dataset: list[Path], **kwargs) -> str: ...    # returns LoRA URL
    async def generate_with_lora(self, prompt: str, lora_url: str, **kwargs) -> Path: ...
    async def synthesize_speech(self, text: str, voice: str, **kwargs) -> Path: ...
```

Phase 2 implementations: `FalProvider`, `ModalProvider`. (No `LocalProvider` — per the user's decision, Phase 2 AI workloads run online to keep the local machine free.)

### `project.json` extensibility
Reserved fields (unused in v1, defined for v2):
```jsonc
{
  "ai": {
    "provider": "fal" /* | "modal" */,
    "image_gen": { "model": "flux-dev", "lora_url": null, "seed": null, "style_suffix": "" },
    "i2v":       { "model": "kling-v2.5-turbo-pro", "duration_s": 10 },
    "tts":       { "model": "openai-tts-1-hd", "voice": "alloy" }
  },
  "characters": [
    { "id": "char-1", "name": "narrator", "lora_url": null, "reference_images": [] }
  ]
}
```

Foreground items get optional generation hints:
```jsonc
{
  "id": "fg-003",
  "sentences": [10, 11],
  "media": null,
  "generate": {
    "kind": "image" /* | "image_to_video" */,
    "prompt": "Tokyo at night, neon-lit alley",
    "character_id": "char-1"
  }
}
```

Renderer: when `media` is `null` and `generate` is set, call the provider, store output in `media/generated/`, set `media` to the file path. Cached.

---

## 16. Phase 3 Forward-Compatibility

When monetization justifies productizing:

| Concern | Phase 1/2 stays as-is | Phase 3 adds |
|---|---|---|
| Frontend | Next.js | Deploy to Vercel; add auth (Clerk / NextAuth), billing (Stripe). |
| Backend | FastAPI | Deploy to Modal / Fly Machines. Add per-user request scoping. |
| Storage | Local filesystem + SQLite | S3-compatible (Cloudflare R2) + Postgres. Migration script reads project folders → cloud. |
| Project model | Single user, folders on disk | Add `user_id`, `org_id`, sharing/permissions. |
| Renders | Local ffmpeg | Modal-hosted ffmpeg workers, scale-to-zero, queued. |
| AI | Track 2 (Fal / Modal) | Same. **No change.** |
| Quotas | None | Per-plan render minutes / storage / AI credits. |

The Phase 1 architecture is deliberately a strict subset of the Phase 3 architecture. No throwaway code.

---

## 17. Open Questions / Known Gotchas

1. **Sentence segmentation accuracy.** Punkt on plain English is ~98% accurate but trips on abbreviations ("Dr. Smith"). Mitigation: ship a small custom override list; allow `transcript.json` (pre-segmented) for users who care.
2. **WhisperX align failure modes.** Long silences, mumbled words, and missing words from transcript can break alignment. Mitigation: surface alignment confidence per word in the UI; let user manually nudge boundaries.
3. **ffmpeg subtitle burn quality.** `subtitles=` filter is fine but renders subpixel-imprecise on some fonts. If quality is insufficient, switch to `ass=` filter with hand-generated ASS file.
4. **Cache poisoning.** If the user edits `voice.wav` in place but the file mtime doesn't change (rare on some tools), alignment cache won't invalidate. Mitigation: hash the file contents, not just mtime.
5. **PiP transition with motion.** Sliding a PiP that itself has Ken Burns motion is non-trivial in ffmpeg. v1.0: PiP scenes get position-only animation, not internal motion. Internal motion + slide transition is v1.5.
6. **Render cancellation.** If user cancels a Final render, partial outputs in `renders/` get a `.partial` suffix and are excluded from the history list.
7. **`npx` cold start time.** Bundling Python via PyInstaller is acceptable but the first `npx` invocation downloads ~500 MB. Document this.
8. **Concurrent renders.** v1 enforces one active render per project. Trying to start a second returns 409.
9. **Transcript-anchored item that points to deleted sentences.** If user shortens transcript, items pointing at sentence indexes beyond the end are flagged as `orphaned` in the UI; not auto-deleted.

---

## 18. Done = ?

Phase 1 is "done" when, on a fresh Windows machine with Node + Python + ffmpeg installed:

```
npx @yourname/video-creator
```

…opens a browser; the user can create a project pointing at a real 15-minute voice file + transcript + folder of images; assign images to sentence ranges via the UI; click "Render Final"; receive a valid 1080p MP4 in `renders/` within 25 minutes; upload it to YouTube and have it transcode without complaints.

Re-rendering after editing one scene: under 5 minutes.

That's the bar.
