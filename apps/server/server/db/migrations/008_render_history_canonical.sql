DROP INDEX IF EXISTS idx_render_history_project;
DROP INDEX IF EXISTS idx_render_history_project_started;
DROP INDEX IF EXISTS idx_render_history_status;

CREATE TABLE render_history_new (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    output_path TEXT NOT NULL,
    video_url TEXT,
    preset TEXT NOT NULL CHECK (preset IN ('draft', 'final')),
    resolution TEXT NOT NULL,
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    status TEXT NOT NULL
        CHECK (status IN ('queued', 'rendering', 'rendered', 'failed', 'unrendered', 'cancelled')),
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_s REAL CHECK (duration_s IS NULL OR duration_s >= 0),
    fps REAL CHECK (fps IS NULL OR fps > 0),
    video_codec TEXT,
    video_crf INTEGER,
    video_preset TEXT,
    audio_codec TEXT,
    audio_bitrate_kbps INTEGER,
    audio_sample_rate INTEGER,
    pixel_format TEXT,
    color_space TEXT,
    size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
    speed REAL,
    frame_count INTEGER CHECK (frame_count IS NULL OR frame_count >= 0),
    config_hash TEXT,
    message TEXT,
    excluded INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

INSERT INTO projects (
    project_id,
    project_path,
    project_name,
    created_at,
    last_render_at
)
SELECT
    'p_' || lower(hex(randomblob(12))) AS project_id,
    rh.project_path,
    CASE
        WHEN trim(coalesce(rh.project_path, '')) = '' THEN 'Recovered Project'
        ELSE rh.project_path
    END AS project_name,
    COALESCE(rh.started_at, datetime('now')) AS created_at,
    COALESCE(rh.finished_at, rh.started_at, datetime('now')) AS last_render_at
FROM render_history rh
LEFT JOIN projects p ON p.project_path = rh.project_path
WHERE p.project_id IS NULL
  AND rh.project_path IS NOT NULL
  AND trim(rh.project_path) != ''
GROUP BY rh.project_path;

INSERT INTO render_history_new (
    id,
    project_id,
    output_path,
    preset,
    resolution,
    width,
    height,
    status,
    started_at,
    finished_at,
    duration_s,
    message,
    created_at,
    updated_at
)
SELECT
    rh.id,
    p.project_id,
    rh.output_path,
    CASE
        WHEN rh.preset = 'draft' THEN 'draft'
        ELSE 'final'
    END AS preset,
    CASE
        WHEN rh.preset = 'vertical' THEN '1080x1920'
        WHEN rh.preset = 'draft' THEN '1280x720'
        ELSE '1920x1080'
    END AS resolution,
    CASE
        WHEN rh.preset = 'vertical' THEN 1080
        WHEN rh.preset = 'draft' THEN 1280
        ELSE 1920
    END AS width,
    CASE
        WHEN rh.preset = 'vertical' THEN 1920
        WHEN rh.preset = 'draft' THEN 720
        ELSE 1080
    END AS height,
    CASE
        WHEN rh.status = 'done' THEN 'rendered'
        WHEN rh.status = 'error' THEN 'failed'
        WHEN rh.status = 'running' THEN 'rendering'
        WHEN rh.status = 'cancelled' THEN 'cancelled'
        ELSE 'queued'
    END AS status,
    rh.started_at,
    rh.finished_at,
    rh.duration_s,
    rh.message,
    COALESCE(rh.started_at, datetime('now')),
    COALESCE(rh.finished_at, rh.started_at, datetime('now'))
FROM render_history rh
JOIN projects p ON p.project_path = rh.project_path;

DROP TABLE render_history;
ALTER TABLE render_history_new RENAME TO render_history;

CREATE INDEX idx_render_history_project_started
    ON render_history(project_id, started_at DESC);

CREATE INDEX idx_render_history_status
    ON render_history(status);
