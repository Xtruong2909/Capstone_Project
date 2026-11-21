ALTER TABLE data_quality_checks
    ADD COLUMN IF NOT EXISTS recording_session_id UUID
        REFERENCES recording_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_data_quality_checks_recording_session_id
    ON data_quality_checks(recording_session_id);

ALTER TABLE data_quality_issues
    ADD COLUMN IF NOT EXISTS recording_session_id UUID
        REFERENCES recording_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_data_quality_issues_recording_session_id
    ON data_quality_issues(recording_session_id);
