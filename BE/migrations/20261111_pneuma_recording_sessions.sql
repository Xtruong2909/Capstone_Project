-- Apply once to existing PostgreSQL databases before enabling multi-file upload.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS recording_date DATE;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS drone_id VARCHAR(32);
ALTER TABLE dataset_versions ADD COLUMN IF NOT EXISTS version_number INTEGER;

CREATE TABLE IF NOT EXISTS recording_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    drone_id VARCHAR(32) NOT NULL,
    recording_date DATE NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    upload_status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_recording_session_filename UNIQUE (dataset_id, original_filename),
    CONSTRAINT uq_recording_session_checksum UNIQUE (dataset_id, checksum)
);
CREATE INDEX IF NOT EXISTS ix_recording_sessions_dataset_id ON recording_sessions(dataset_id);

CREATE TABLE IF NOT EXISTS dataset_version_sessions (
    version_id UUID NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES recording_sessions(id) ON DELETE CASCADE,
    CONSTRAINT uq_version_session PRIMARY KEY (version_id, session_id)
);

CREATE TABLE IF NOT EXISTS dataset_upload_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_files INTEGER NOT NULL,
    processed_files INTEGER NOT NULL DEFAULT 0,
    result JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY dataset_id ORDER BY created_at, id) AS ordinal
    FROM dataset_versions
)
UPDATE dataset_versions AS version
SET version_number = ordered.ordinal
FROM ordered
WHERE version.id = ordered.id AND version.version_number IS NULL;
