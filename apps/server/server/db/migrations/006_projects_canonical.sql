DROP TABLE IF EXISTS recent_projects;
DROP INDEX IF EXISTS idx_projects_last_opened;
DROP INDEX IF EXISTS idx_projects_last_opened_at;

CREATE TABLE projects_new (
    project_id TEXT PRIMARY KEY,
    project_path TEXT NOT NULL UNIQUE,
    project_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_render_at TEXT NOT NULL DEFAULT (datetime('now')),
    voice_duration_s REAL,
    sentence_count INTEGER NOT NULL DEFAULT 0 CHECK (sentence_count >= 0),
    media_count INTEGER NOT NULL DEFAULT 0 CHECK (media_count >= 0),
    thumbnail_path TEXT,
    palette_seed TEXT NOT NULL DEFAULT 'night',
    project_mtime TEXT,
    current_config_hash TEXT,
    last_rendered_config_hash TEXT,
    has_unrendered_changes INTEGER NOT NULL DEFAULT 1 CHECK (has_unrendered_changes IN (0, 1)),
    last_error TEXT
);

INSERT INTO projects_new (
    project_id,
    project_path,
    project_name,
    created_at,
    last_render_at,
    voice_duration_s,
    sentence_count,
    media_count,
    thumbnail_path,
    palette_seed,
    project_mtime,
    current_config_hash,
    last_rendered_config_hash,
    has_unrendered_changes,
    last_error
)
SELECT
    project_id,
    path,
    name,
    COALESCE(created_at, datetime('now')),
    COALESCE(updated_at, last_opened_at, created_at, datetime('now')),
    voice_duration_s,
    sentence_count,
    media_count,
    thumbnail_path,
    palette_seed,
    project_mtime,
    current_config_hash,
    last_rendered_config_hash,
    has_unrendered_changes,
    last_error
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX idx_projects_last_render_at
    ON projects(last_render_at DESC);
