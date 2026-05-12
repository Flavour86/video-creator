-- Add missing SPEC-required columns to projects table
ALTER TABLE projects ADD COLUMN voice_duration_s REAL;
ALTER TABLE projects ADD COLUMN sentence_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN media_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN palette_seed TEXT NOT NULL DEFAULT 'night';
ALTER TABLE projects ADD COLUMN project_mtime TEXT;
ALTER TABLE projects ADD COLUMN exists_on_disk INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN last_error TEXT;

-- Align has_unrendered_changes default with SPEC (0 → 1 for unrendered projects)
UPDATE projects SET has_unrendered_changes = 1 WHERE has_unrendered_changes = 0;

-- Remove non-spec app_settings keys (UI preferences belong in browser storage)
DELETE FROM app_settings WHERE key NOT IN ('default_output_preset');
