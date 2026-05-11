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
