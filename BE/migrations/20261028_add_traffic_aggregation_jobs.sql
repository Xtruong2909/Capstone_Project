-- Add traffic aggregation job tracking table for background processing.
-- Apply once on existing databases that were created before this schema was added.
BEGIN;

CREATE TABLE IF NOT EXISTS traffic_aggregation_jobs (
    id UUID PRIMARY KEY,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    aggregation_interval INTEGER NOT NULL DEFAULT 60,
    roi_identifier VARCHAR(64) NOT NULL DEFAULT 'MAIN_ROI',
    replace_existing BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    records_created INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    job_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traffic_aggregation_jobs_dataset_status
    ON traffic_aggregation_jobs(dataset_id, status);

CREATE INDEX IF NOT EXISTS idx_traffic_aggregation_jobs_version
    ON traffic_aggregation_jobs(dataset_version_id, aggregation_interval, roi_identifier);

COMMIT;
