DROP INDEX IF EXISTS idx_render_artifacts_render;
DROP INDEX IF EXISTS idx_render_events_render;
DROP INDEX IF EXISTS idx_render_events_render_ts;

CREATE TABLE render_artifacts_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    render_id TEXT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('output', 'partial', 'log', 'graph', 'subtitles', 'thumbnail')),
    path TEXT NOT NULL,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (render_id) REFERENCES render_history(id) ON DELETE CASCADE
);

INSERT INTO render_artifacts_new (render_id, kind, path, size_bytes, created_at)
SELECT
    ra.render_id,
    CASE
        WHEN ra.kind IN ('draft_mp4', 'final_mp4', 'output') THEN 'output'
        WHEN ra.kind = 'partial' THEN 'partial'
        WHEN ra.kind IN ('log', 'logs') THEN 'log'
        WHEN ra.kind IN ('graph', 'filtergraph') THEN 'graph'
        WHEN ra.kind IN ('subtitles', 'subtitle', 'srt') THEN 'subtitles'
        WHEN ra.kind IN ('thumbnail', 'thumb') THEN 'thumbnail'
        ELSE NULL
    END AS mapped_kind,
    ra.path,
    CASE
        WHEN typeof(ra.size) IN ('integer', 'real') THEN CAST(ra.size AS INTEGER)
        ELSE NULL
    END AS mapped_size_bytes,
    COALESCE(ra.created_at, datetime('now'))
FROM render_artifacts ra
WHERE
    CASE
        WHEN ra.kind IN ('draft_mp4', 'final_mp4', 'output') THEN 'output'
        WHEN ra.kind = 'partial' THEN 'partial'
        WHEN ra.kind IN ('log', 'logs') THEN 'log'
        WHEN ra.kind IN ('graph', 'filtergraph') THEN 'graph'
        WHEN ra.kind IN ('subtitles', 'subtitle', 'srt') THEN 'subtitles'
        WHEN ra.kind IN ('thumbnail', 'thumb') THEN 'thumbnail'
        ELSE NULL
    END IS NOT NULL;

DROP TABLE render_artifacts;
ALTER TABLE render_artifacts_new RENAME TO render_artifacts;

CREATE INDEX idx_render_artifacts_render
    ON render_artifacts(render_id);

CREATE TABLE render_events_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    render_id TEXT NOT NULL,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    phase TEXT NOT NULL,
    progress REAL CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
    message TEXT,
    detail_json TEXT,
    FOREIGN KEY (render_id) REFERENCES render_history(id) ON DELETE CASCADE
);

INSERT INTO render_events_new (render_id, ts, phase, progress, message, detail_json)
SELECT
    re.render_id,
    COALESCE(re.created_at, datetime('now')) AS ts,
    COALESCE(re.stage, 'unknown') AS phase,
    re.progress,
    re.message,
    CASE
        WHEN re.status IS NOT NULL THEN json_object('status', re.status)
        ELSE NULL
    END AS detail_json
FROM render_events re
ORDER BY re.id;

DROP TABLE render_events;
ALTER TABLE render_events_new RENAME TO render_events;

CREATE INDEX idx_render_events_render_ts
    ON render_events(render_id, ts);
