-- Quality reports are stored in data_quality_checks.report.
-- Permanently removes the unused table and any rows it contains.
-- No CASCADE: unexpected dependent objects must not be deleted.
BEGIN;
DROP TABLE IF EXISTS public.data_quality_reports;
COMMIT;
