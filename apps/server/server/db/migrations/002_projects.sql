CREATE TABLE IF NOT EXISTS projects (
    project_id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    alignment_state TEXT NOT NULL DEFAULT 'missing',
    thumbnail_path TEXT,
    current_config_hash TEXT,
    last_rendered_config_hash TEXT,
    has_unrendered_changes INTEGER NOT NULL DEFAULT 0,
    render_enabled INTEGER NOT NULL DEFAULT 0,
    latest_render_id TEXT,
    latest_render_status TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_last_opened
    ON projects(last_opened_at DESC);

INSERT INTO projects (
    project_id,
    path,
    name,
    status,
    alignment_state,
    created_at,
    updated_at,
    last_opened_at
)
SELECT
    'p_' || lower(hex(randomblob(16))),
    path,
    name,
    'ready',
    'missing',
    last_opened_at,
    last_opened_at,
    last_opened_at
FROM recent_projects
WHERE NOT EXISTS (
    SELECT 1 FROM projects WHERE projects.path = recent_projects.path
);
