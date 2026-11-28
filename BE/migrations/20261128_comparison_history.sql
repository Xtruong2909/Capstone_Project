BEGIN;
CREATE TABLE IF NOT EXISTS comparison_histories (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES dataset_groups(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(16) NOT NULL CHECK (mode IN ('compare', 'overall')),
    experiment_ids JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_comparison_history_owner_batch_created
    ON comparison_histories(created_by, group_id, created_at DESC);
COMMIT;
