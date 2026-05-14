CREATE TABLE project_configs_new (
    project_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL,
    config_hash TEXT NOT NULL,
    saved_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

WITH ranked AS (
    SELECT
        project_id,
        config_json,
        config_hash,
        COALESCE(created_at, datetime('now')) AS created_at,
        ROW_NUMBER() OVER (
            PARTITION BY project_id
            ORDER BY created_at DESC, id DESC
        ) AS rn
    FROM project_configs
)
INSERT INTO project_configs_new (
    project_id,
    schema_version,
    config_json,
    config_hash,
    saved_at,
    updated_at
)
SELECT
    project_id,
    1,
    config_json,
    config_hash,
    created_at,
    created_at
FROM ranked
WHERE rn = 1;

DROP TABLE project_configs;
ALTER TABLE project_configs_new RENAME TO project_configs;
