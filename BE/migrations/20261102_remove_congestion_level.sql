-- Remove the obsolete classification field and discard its stored labels.
BEGIN;

ALTER TABLE traffic_time_series
    DROP COLUMN IF EXISTS congestion_level;

COMMIT;
