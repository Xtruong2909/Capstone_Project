CREATE TABLE IF NOT EXISTS dataset_group_processing_jobs (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES dataset_groups(id) ON DELETE CASCADE,
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('NORMALIZE', 'EXPORT')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    total_datasets INTEGER NOT NULL,
    processed_datasets INTEGER NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_dataset_group_processing_jobs_group_id
    ON dataset_group_processing_jobs(group_id);
