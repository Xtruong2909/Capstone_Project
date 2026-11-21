-- Remove schema objects that are no longer represented or used by the application.
-- Deliberately avoid CASCADE so unexpected dependencies stop the migration.
BEGIN;

DROP TABLE IF EXISTS ai_assistant_logs;
DROP TABLE IF EXISTS model_parameters;
DROP TABLE IF EXISTS traffic_reports;

ALTER TABLE dataset_column_mappings
    DROP COLUMN IF EXISTS recording_session_id;

COMMIT;
