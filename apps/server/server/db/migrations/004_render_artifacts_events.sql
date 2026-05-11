CREATE TABLE IF NOT EXISTS render_artifacts (
    artifact_id TEXT PRIMARY KEY,
    render_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    size INTEGER,
    hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    playable INTEGER NOT NULL DEFAULT 0,
    reusable INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_render_artifacts_render
    ON render_artifacts(render_id);

CREATE TABLE IF NOT EXISTS render_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    render_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    progress REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_render_events_render
    ON render_events(render_id, id);
