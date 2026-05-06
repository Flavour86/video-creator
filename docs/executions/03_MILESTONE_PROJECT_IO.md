# Milestone 2 — Project I/O

> **Goal**: Create, open, and list projects on disk. Drag/drop media into a project. After this milestone, the user can scaffold a real project folder structure but cannot yet edit it.

---

## Tasks

| ID | Title | Time |
|---|---|---|
| T2.1 | Global app DB (SQLite) | 60 min |
| T2.2 | Full `project.json` schema + JSON Schema validation | 90 min |
| T2.3 | New project flow | 90 min |
| T2.4 | Open project + Recent projects UI | 90 min |
| T2.5 | Media ingest (drag-drop into project) | 60 min |

---

## T2.1 — Global app DB (SQLite)

### Goal
Initialize a SQLite DB at the path determined by `Settings.app_db_path` with `recent_projects`, `app_settings`, and `render_history` tables. Provide a Python module that exposes typed CRUD helpers.

### Prerequisites
- M1 complete.

### Skip-detection
Run:
```powershell
& apps/server/.venv/Scripts/python -c "from server.db.app_db import init_db; init_db(); print('ok')"
```
If it prints `ok` and the DB has the three tables, skip.

### Files to create

#### `apps/server/server/db/__init__.py`
Empty.

#### `apps/server/server/db/app_db.py`
```python
"""Global application SQLite DB.

Holds: recent projects, app settings, render history.
One DB per host. Path comes from settings.app_db_path.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from server.settings import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS recent_projects (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS render_history (
    id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    output_path TEXT NOT NULL,
    preset TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_s REAL,
    status TEXT NOT NULL,
    message TEXT
);

CREATE INDEX IF NOT EXISTS idx_render_history_project
    ON render_history(project_path);
"""


def init_db(path: Path | None = None) -> None:
    db_path = path or settings.app_db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    init_db()
    conn = sqlite3.connect(settings.app_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

#### `apps/server/server/db/projects.py`
```python
"""Recent-projects CRUD."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from server.db.app_db import connection


def touch_recent(path: Path, name: str) -> None:
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO recent_projects (path, name, last_opened_at)
            VALUES (?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                name = excluded.name,
                last_opened_at = excluded.last_opened_at
            """,
            (str(path.resolve()), name, datetime.now(timezone.utc).isoformat()),
        )


def list_recent(limit: int = 20) -> list[dict[str, str]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT path, name, last_opened_at FROM recent_projects "
            "ORDER BY last_opened_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def remove_recent(path: Path) -> None:
    with connection() as conn:
        conn.execute(
            "DELETE FROM recent_projects WHERE path = ?", (str(path.resolve()),)
        )
```

#### `apps/server/tests/test_app_db.py`
```python
import tempfile
from pathlib import Path

from server.db.app_db import init_db, connection
from server.db.projects import list_recent, remove_recent, touch_recent
from server.settings import settings


def test_init_creates_tables(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    init_db()
    with connection() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    names = [r["name"] for r in rows]
    assert "recent_projects" in names
    assert "app_settings" in names
    assert "render_history" in names


def test_recent_round_trip(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "app_db_path", tmp_path / "test.db")
    p = tmp_path / "myproj"
    p.mkdir()
    touch_recent(p, "My Project")
    rows = list_recent()
    assert len(rows) == 1
    assert rows[0]["name"] == "My Project"
    remove_recent(p)
    assert list_recent() == []
```

### Verification
```powershell
pnpm -F @vc/server test
```
All previous tests + 2 new ones pass.

### Commit
```
chore(server): add app SQLite DB and recent-projects CRUD

Refs: T2.1
```

---

## T2.2 — Full `project.json` schema

### Goal
Replace the stub `project.schema.json` with the complete schema specified in `PHASE_1_DESIGN.md` §6. Regenerate TS and Python types. Add a Python helper `Project.load(path)` that validates.

### Prerequisites
- T2.1, T1.4 complete.

### Skip-detection
```powershell
$schema = Get-Content packages/shared-schemas/project.schema.json | ConvertFrom-Json
($schema.properties.layers.properties.foreground.items.properties.compositing) -ne $null
```
If True, skema is filled in → skip.

### Steps

#### 1. Replace `packages/shared-schemas/project.schema.json`
Write the **full** schema from `PHASE_1_DESIGN.md` §6. The schema must define:

- `version` (const 1)
- `name`, `created_at`, `updated_at`
- `audio` (string, file path)
- `transcript` ({ kind, path })
- `output` (full preset object: resolution, fps, codecs, bitrates, container, color_space)
- `layers.auto_distribute`:
  - `kind`: `"images" | "clips" | "single_image" | "none"`
  - `items`: array of strings (paths)
  - `transition`: `"crossfade" | "cut"`
  - `transition_duration_s`: number
- `layers.foreground[]`:
  - `id`, `z`, `anchor` (transcript|time)
  - For `anchor=transcript`: `sentences: integer[]`
  - For `anchor=time`: `from`, `to` (HH:MM:SS.mmm)
  - `media`: string (or null if Phase 2 generation)
  - `compositing`: `"fullscreen"` OR object with `mode: "pip"`, `position`, `offset_x`, `offset_y`, `scale`, `border_radius`
  - `motion`: `null` or `{ kind: "ken_burns", from: {scale, x, y}, to: {scale, x, y}, easing }`
  - `transition_in`, `transition_out`: `null` or `{ kind: "cut" | "fade" | "slide", duration_s, [from] }`
- `subtitles`: `null` or `{ generate_srt, burn_in, style }`
- `watermark`: `null` or `{ image, position, offset_x, offset_y, scale, opacity }`

Use JSON Schema `oneOf` for the discriminated unions (foreground anchor; compositing). Mark `additionalProperties: false` everywhere.

Reserve future-Phase-2 fields:
- `ai`: `null` or object (loose for now).
- `characters`: `null` or array.
- Foreground item's `generate`: optional object.

Do not invent content. Write each property exactly as specified in §6 of the design doc. If anything is ambiguous, note it in STATE.md and ask.

#### 2. Regenerate
```powershell
pnpm gen:types
pnpm gen:py
```

Expect both to succeed without errors. Inspect:
- `packages/shared-schemas/ts/index.ts` — should export named types `Project`, `ForegroundItem`, etc.
- `packages/shared-schemas/py/schemas.py` — should define Pydantic v2 `BaseModel` classes.

#### 3. `apps/server/server/domain/project.py`
```python
"""Project file load/save with validation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import sys

# Make codegen package importable
_REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_REPO / "packages" / "shared-schemas" / "py"))
from schemas import Project  # type: ignore[import-not-found]  # noqa: E402

__all__ = ["Project", "load_project", "save_project"]


def load_project(project_dir: Path) -> Project:
    pj = project_dir / "project.json"
    if not pj.exists():
        raise FileNotFoundError(f"project.json not found in {project_dir}")
    data: dict[str, Any] = json.loads(pj.read_text(encoding="utf-8"))
    return Project.model_validate(data)


def save_project(project_dir: Path, project: Project) -> None:
    pj = project_dir / "project.json"
    project_dir.mkdir(parents=True, exist_ok=True)
    pj.write_text(
        json.dumps(project.model_dump(mode="json", exclude_none=True), indent=2),
        encoding="utf-8",
    )
```

#### 4. Test
`apps/server/tests/test_project_schema.py`:
```python
from pathlib import Path

from server.domain.project import Project, load_project, save_project


def test_minimal_valid(tmp_path: Path) -> None:
    p = Project.model_validate({
        "version": 1,
        "name": "test",
        "audio": "voice.wav",
        "transcript": {"kind": "plain_text", "path": "transcript.txt"},
        "output": {"preset": "draft"},
        "layers": {"foreground": []},
    })
    save_project(tmp_path, p)
    loaded = load_project(tmp_path)
    assert loaded.name == "test"


def test_invalid_version_rejected() -> None:
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Project.model_validate({"version": 2, "name": "x"})
```

### Verification
```powershell
pnpm gen:types
pnpm gen:py
pnpm -F @vc/server test
```

### Common failures
- **`datamodel-code-generator` produces unions of `Any`**: schema's `oneOf` clauses lack discriminators. Add `discriminator` keys.
- **Schema's `additionalProperties: false` rejects field codegen added**: don't ship the schema with codegen-only properties. Keep schema clean.

### Commit
```
feat(schema): full project.json schema with TS+Pydantic types

Refs: T2.2
```

---

## T2.3 — New project flow

### Goal
A user can pick (or type) a folder path; the server creates the project structure, writes a default `project.json`, and registers it in `recent_projects`.

### Prerequisites
- T2.1, T2.2 complete.

### API

`POST /projects` — body: `{ path: string, name: string }`
- Validates `path` is absolute, parent exists, `path` is empty or doesn't exist.
- Creates `path/`, `path/media/`, `path/renders/`, `path/.vc/`.
- Writes `project.json` with defaults (audio="", transcript stub, output preset draft, empty foreground).
- Calls `touch_recent(path, name)`.
- Returns `200 { path, name }`.

Error codes:
- `400 INVALID_PATH` — path not absolute or parent missing.
- `409 NOT_EMPTY` — directory exists and contains files.

### Files

`apps/server/server/routes/projects.py` — implement the endpoint. Register the router in `server/main.py`.

UI: `apps/web/app/projects/new/page.tsx` — form with path input + name input + Submit. POSTs to `/api/server/projects`.

### Verification

Manual:
1. `pnpm dev`.
2. Open http://localhost:3000/projects/new.
3. Enter a path like `C:\Users\<you>\Documents\test-project` (must not exist or be empty).
4. Submit. Confirm directory was created with the expected substructure.
5. `Get-Content <path>/project.json` shows valid JSON.

Automated test in `apps/server/tests/test_projects_route.py`:
```python
import httpx
import pytest
from server.main import app


@pytest.mark.asyncio
async def test_create_project(tmp_path):
    target = tmp_path / "newproj"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.post("/projects", json={"path": str(target), "name": "Test"})
    assert r.status_code == 200
    assert (target / "project.json").exists()
    assert (target / "media").is_dir()
    assert (target / ".vc").is_dir()
```

### Commit
```
feat(server,web): new project creation flow

Refs: T2.3
```

---

## T2.4 — Open project + Recent projects UI

### Goal
- `GET /projects/recent` returns the recent projects list.
- `POST /projects/open` body `{ path }` validates `project.json` exists and parses; touches recent.
- The homepage (`apps/web/app/page.tsx`) shows a list of recent projects with a click-to-open action and a "New Project" button.

### Prerequisites
- T2.3 complete.

### Behavior
- Clicking a recent project navigates to `/projects/<encoded-path>`. The page calls `POST /projects/open` and renders an empty editor placeholder ("Loaded: <name>").
- If the project folder no longer exists, show an error and offer "Remove from recent" (calls `DELETE /projects/recent` body `{ path }`).

### Verification
1. Create two projects via T2.3.
2. Reload http://localhost:3000.
3. Both projects appear, most recent first.
4. Click one → editor placeholder loads.
5. Delete the folder via filesystem; reload → "Folder missing" error with remove button works.

### Commit
```
feat(web,server): recent projects + open flow

Refs: T2.4
```

---

## T2.5 — Media ingest (drag-drop)

### Goal
On the editor page (`/projects/<path>`), the user drag-drops images/clips. The browser uploads them to the server, which writes them into the project's `media/` folder and returns the canonical filenames. Generate a 256×144 thumbnail for each image into `.vc/thumbs/`.

### API
- `POST /projects/<id>/media` — multipart/form-data; saves files, generates thumbnails, returns `[{ filename, size, kind: "image"|"video", thumb_path }]`.
- `GET /projects/<id>/media` — list current media.

### Server requirements
- Validate file types: `.jpg .jpeg .png .webp .mp4 .mov .webm`.
- Reject anything else with `400 UNSUPPORTED_TYPE`.
- Sanitize filenames (no `..`, no path separators).
- On filename collision: append `-2`, `-3`, etc.
- Thumbnails: ffmpeg one-liner per file, 256×144, JPEG quality 80.

### Web requirements
- Drop zone covers most of the editor.
- Show progress per file.
- After upload, render a grid of thumbnails labeled with filename.

### Verification

Manual:
1. Open a project.
2. Drag in 5 images and 1 video.
3. Confirm `media/` contains all 6.
4. Confirm `.vc/thumbs/*.jpg` exists for each.
5. Reload the page → grid of thumbnails persists.

Automated in `apps/server/tests/test_media_upload.py` covers:
- File saved with correct name.
- Collision rename works.
- Unsupported type rejected.

### Commit
```
feat(web,server): drag-drop media ingest with thumbnail generation

Refs: T2.5
```

---

## Milestone 2 verification (smoke project)

After this milestone, run end-to-end:

```powershell
pnpm dev
```

1. Create new project at `C:\tmp\smoke-1`.
2. Drop in a small `voice.wav` (any audio you have), `transcript.txt`, and 3 images.
3. Reload — recent projects shows "smoke-1" at top.
4. Click — editor placeholder loads with 3 thumbnails.
5. `Get-Content C:\tmp\smoke-1\project.json` shows the default content.

When all 5 pass, milestone is complete. Update `STATE.md`.
