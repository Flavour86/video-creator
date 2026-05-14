-- Keep only backend-level app settings.
DELETE FROM app_settings WHERE key NOT IN ('default_output_preset');

DROP TRIGGER IF EXISTS app_settings_whitelist_insert;
CREATE TRIGGER app_settings_whitelist_insert
BEFORE INSERT ON app_settings
FOR EACH ROW
WHEN NEW.key NOT IN ('default_output_preset')
BEGIN
    SELECT RAISE(ABORT, 'invalid app_settings key');
END;
DROP TRIGGER IF EXISTS app_settings_whitelist_update;
CREATE TRIGGER app_settings_whitelist_update
BEFORE UPDATE ON app_settings
FOR EACH ROW
WHEN NEW.key NOT IN ('default_output_preset')
BEGIN
    SELECT RAISE(ABORT, 'invalid app_settings key');
END;
