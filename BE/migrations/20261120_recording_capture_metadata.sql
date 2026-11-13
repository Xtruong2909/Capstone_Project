-- Optional verified capture log metadata; filename times remain scheduled only.
ALTER TABLE recording_sessions
    ADD COLUMN IF NOT EXISTS actual_recording_start TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS actual_recording_end TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS continuous_recording BOOLEAN,
    ADD COLUMN IF NOT EXISTS recording_time_source VARCHAR(255);

ALTER TABLE recording_sessions
    DROP CONSTRAINT IF EXISTS ck_recording_capture_metadata;
ALTER TABLE recording_sessions
    ADD CONSTRAINT ck_recording_capture_metadata CHECK (
        (actual_recording_start IS NULL AND actual_recording_end IS NULL
            AND continuous_recording IS NULL AND recording_time_source IS NULL)
        OR (actual_recording_start IS NOT NULL AND actual_recording_end IS NOT NULL
            AND actual_recording_end > actual_recording_start
            AND continuous_recording IS NOT NULL AND recording_time_source IS NOT NULL
            AND length(trim(recording_time_source)) > 0)
    );
