-- Persist Data Scientist temporal aggregation runs and per-session time series.
-- Existing traffic rows remain untouched and keep their legacy uniqueness rule.
BEGIN;

ALTER TABLE traffic_aggregation_jobs
    ADD COLUMN IF NOT EXISTS total_sessions INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS completed_sessions INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_sessions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE traffic_time_series
    ADD COLUMN IF NOT EXISTS aggregation_id UUID
        REFERENCES traffic_aggregation_jobs(id) ON DELETE CASCADE,
    -- The legacy column already exists as VARCHAR(255) on deployed databases
    -- and contains filenames as well as session IDs. Preserve that format.
    ADD COLUMN IF NOT EXISTS recording_session_id VARCHAR(255);

ALTER TABLE traffic_time_series
    DROP CONSTRAINT IF EXISTS ck_traffic_interval,
    DROP CONSTRAINT IF EXISTS uq_traffic_bucket,
    ADD CONSTRAINT ck_traffic_interval CHECK (aggregation_interval > 0);

-- Legacy rows have no aggregation_id. Keep their old uniqueness semantics while
-- permitting independent session/run buckets for new aggregation executions.
CREATE UNIQUE INDEX IF NOT EXISTS uq_traffic_bucket_legacy
    ON traffic_time_series(dataset_version_id, roi_identifier, time_bucket)
    WHERE aggregation_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_traffic_run_session_bucket
    ON traffic_time_series(aggregation_id, recording_session_id, time_bucket)
    WHERE aggregation_id IS NOT NULL AND recording_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_traffic_run_session_time
    ON traffic_time_series(aggregation_id, recording_session_id, time_bucket);
CREATE INDEX IF NOT EXISTS ix_traffic_time_series_aggregation_id
    ON traffic_time_series(aggregation_id);
CREATE INDEX IF NOT EXISTS ix_traffic_time_series_recording_session_id
    ON traffic_time_series(recording_session_id);

CREATE TABLE IF NOT EXISTS traffic_aggregation_session_results (
    id BIGSERIAL PRIMARY KEY,
    aggregation_id UUID NOT NULL
        REFERENCES traffic_aggregation_jobs(id) ON DELETE CASCADE,
    session_id UUID NOT NULL
        REFERENCES recording_sessions(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
    time_bins INTEGER NOT NULL DEFAULT 0 CHECK (time_bins >= 0),
    records_read BIGINT NOT NULL DEFAULT 0 CHECK (records_read >= 0),
    error_message TEXT,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_aggregation_session_result UNIQUE (aggregation_id, session_id)
);

CREATE INDEX IF NOT EXISTS ix_aggregation_session_results_aggregation
    ON traffic_aggregation_session_results(aggregation_id, status);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_session_results_aggregation_id
    ON traffic_aggregation_session_results(aggregation_id);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_session_results_session_id
    ON traffic_aggregation_session_results(session_id);

COMMIT;
