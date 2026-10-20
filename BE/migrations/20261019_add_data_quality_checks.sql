CREATE TABLE IF NOT EXISTS data_quality_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    started_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    progress_percent INTEGER NOT NULL DEFAULT 0
        CHECK (progress_percent BETWEEN 0 AND 100),
    processed_rows BIGINT NOT NULL DEFAULT 0,
    total_rows BIGINT,
    report JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_data_quality_checks_dataset_id
    ON data_quality_checks(dataset_id);
CREATE INDEX IF NOT EXISTS ix_data_quality_checks_dataset_version_id
    ON data_quality_checks(dataset_version_id);
CREATE INDEX IF NOT EXISTS ix_data_quality_checks_status
    ON data_quality_checks(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_quality_active_version
    ON data_quality_checks(dataset_version_id)
    WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS data_quality_issues (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID NOT NULL REFERENCES data_quality_checks(id) ON DELETE CASCADE,
    row_number BIGINT,
    issue_type VARCHAR(32) NOT NULL,
    column_name VARCHAR(512),
    message VARCHAR(512) NOT NULL,
    observed_value VARCHAR(256)
);

CREATE INDEX IF NOT EXISTS ix_data_quality_issues_check_id
    ON data_quality_issues(check_id);
CREATE INDEX IF NOT EXISTS ix_data_quality_issues_issue_type
    ON data_quality_issues(issue_type);
CREATE INDEX IF NOT EXISTS ix_data_quality_issue_check_row
    ON data_quality_issues(check_id, row_number);
