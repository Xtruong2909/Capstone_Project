-- Quality reports reference the public aggregation ID and preserve per-session findings.
-- No source or aggregated traffic rows are changed.
BEGIN;

CREATE TABLE IF NOT EXISTS traffic_aggregation_quality_checks (
    id UUID PRIMARY KEY,
    aggregation_id UUID NOT NULL REFERENCES traffic_aggregation_jobs(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL,
    summary JSONB NOT NULL,
    ready_for_feature_generation BOOLEAN NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_quality_checks_aggregation_id
    ON traffic_aggregation_quality_checks(aggregation_id);

CREATE TABLE IF NOT EXISTS traffic_aggregation_quality_sessions (
    id BIGSERIAL PRIMARY KEY,
    quality_check_id UUID NOT NULL REFERENCES traffic_aggregation_quality_checks(id)
        ON DELETE CASCADE,
    aggregation_id UUID NOT NULL REFERENCES traffic_aggregation_jobs(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    time_bins INTEGER NOT NULL CHECK (time_bins >= 0),
    valid_bins INTEGER NOT NULL CHECK (valid_bins >= 0),
    flagged_bins INTEGER NOT NULL CHECK (flagged_bins >= 0),
    invalid_bins INTEGER NOT NULL CHECK (invalid_bins >= 0),
    issue_counts JSONB NOT NULL,
    check_status JSONB NOT NULL,
    ready_for_feature_generation BOOLEAN NOT NULL,
    CONSTRAINT uq_traffic_aggregation_quality_session UNIQUE (quality_check_id, session_id)
);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_quality_sessions_quality_check_id
    ON traffic_aggregation_quality_sessions(quality_check_id);

CREATE TABLE IF NOT EXISTS traffic_aggregation_quality_issues (
    id BIGSERIAL PRIMARY KEY,
    quality_check_id UUID NOT NULL REFERENCES traffic_aggregation_quality_checks(id)
        ON DELETE CASCADE,
    aggregation_id UUID NOT NULL REFERENCES traffic_aggregation_jobs(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ,
    vehicle_count INTEGER,
    issue_type VARCHAR(40) NOT NULL,
    severity VARCHAR(16) NOT NULL,
    description TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_quality_issues_quality_check_id
    ON traffic_aggregation_quality_issues(quality_check_id);
CREATE INDEX IF NOT EXISTS ix_traffic_aggregation_quality_issues_session_time
    ON traffic_aggregation_quality_issues(aggregation_id, dataset_id, session_id, timestamp);

COMMIT;
