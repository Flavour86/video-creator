CREATE TABLE IF NOT EXISTS project_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_configs_project_created
    ON project_configs(project_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_configs_project_hash
    ON project_configs(project_id, config_hash);
