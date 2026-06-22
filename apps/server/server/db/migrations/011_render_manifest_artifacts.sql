DROP INDEX IF EXISTS idx_render_artifacts_render;

CREATE TABLE render_artifacts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    render_id TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('output', 'partial', 'log', 'graph', 'manifest', 'subtitles', 'thumbnail')),
    path TEXT NOT NULL,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (render_id) REFERENCES render_history(id) ON DELETE CASCADE
);

INSERT INTO render_artifacts_new (id, render_id, kind, path, size_bytes, created_at)
SELECT id, render_id, kind, path, size_bytes, created_at
FROM render_artifacts
WHERE kind IN ('output', 'partial', 'log', 'graph', 'manifest', 'subtitles', 'thumbnail');

DROP TABLE render_artifacts;
ALTER TABLE render_artifacts_new RENAME TO render_artifacts;

CREATE INDEX idx_render_artifacts_render
    ON render_artifacts(render_id);
