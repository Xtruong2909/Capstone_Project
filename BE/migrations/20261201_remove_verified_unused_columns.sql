-- Audited against runtime imports, API schemas, raw SQL, tests and live data.
-- Retain the historical migrations; this migration defines the new schema.
-- Refuse to remove any populated column. Never use CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

LOCK TABLE forecast_results, recording_sessions, traffic_time_series IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    candidate RECORD;
    has_values BOOLEAN;
BEGIN
    FOR candidate IN
        SELECT * FROM (VALUES
            ('forecast_results', 'lower_bound'),
            ('forecast_results', 'upper_bound'),
            ('recording_sessions', 'actual_recording_start'),
            ('recording_sessions', 'actual_recording_end'),
            ('recording_sessions', 'continuous_recording'),
            ('recording_sessions', 'recording_time_source'),
            ('traffic_time_series', 'traffic_density')
        ) AS candidates(table_name, column_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = candidate.table_name
              AND column_name = candidate.column_name
        ) THEN
            EXECUTE format(
                'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I IS NOT NULL)',
                current_schema(), candidate.table_name, candidate.column_name
            ) INTO has_values;
            IF has_values THEN
                RAISE EXCEPTION 'Cleanup refused: %.% contains data',
                    candidate.table_name, candidate.column_name;
            END IF;
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE forecast_results
    DROP COLUMN IF EXISTS lower_bound,
    DROP COLUMN IF EXISTS upper_bound;

ALTER TABLE recording_sessions
    DROP CONSTRAINT IF EXISTS ck_recording_capture_metadata,
    DROP COLUMN IF EXISTS actual_recording_start,
    DROP COLUMN IF EXISTS actual_recording_end,
    DROP COLUMN IF EXISTS continuous_recording,
    DROP COLUMN IF EXISTS recording_time_source;

ALTER TABLE traffic_time_series
    DROP CONSTRAINT IF EXISTS ck_traffic_density,
    DROP COLUMN IF EXISTS traffic_density;

COMMIT;
