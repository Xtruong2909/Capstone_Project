CREATE TABLE IF NOT EXISTS lag_feature_generations (
    id UUID PRIMARY KEY,
    aggregation_id UUID NOT NULL REFERENCES traffic_aggregation_jobs(id),
    configuration_hash VARCHAR(64) NOT NULL,
    configuration JSONB NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
    sample_count INTEGER NOT NULL DEFAULT 0,
    warning VARCHAR(255) NOT NULL DEFAULT 'Recording coverage is not verified',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_lag_generation_config UNIQUE (aggregation_id, configuration_hash)
);

CREATE TABLE IF NOT EXISTS lag_feature_samples (
    id BIGSERIAL PRIMARY KEY,
    generation_id UUID NOT NULL REFERENCES lag_feature_generations(id) ON DELETE CASCADE,
    aggregation_id UUID NOT NULL REFERENCES traffic_aggregation_jobs(id),
    dataset_id UUID NOT NULL REFERENCES datasets(id),
    session_id UUID NOT NULL REFERENCES recording_sessions(id),
    timestamp TIMESTAMPTZ NOT NULL,
    lag_1 INTEGER NOT NULL,
    lag_2 INTEGER NOT NULL,
    lag_3 INTEGER NOT NULL,
    lag_4 INTEGER NOT NULL,
    lag_5 INTEGER NOT NULL,
    target_h1 INTEGER NOT NULL,
    target_h3 INTEGER NOT NULL,
    target_h5 INTEGER NOT NULL,
    CONSTRAINT uq_lag_sample_session_time UNIQUE (generation_id, session_id, timestamp),
    CONSTRAINT ck_lag_sample_features CHECK (lag_1 >= 0 AND lag_2 >= 0 AND lag_3 >= 0 AND lag_4 >= 0 AND lag_5 >= 0),
    CONSTRAINT ck_lag_sample_targets CHECK (target_h1 >= 0 AND target_h3 >= 0 AND target_h5 >= 0)
);
ALTER TABLE lag_feature_samples
    ADD COLUMN IF NOT EXISTS aggregation_id UUID REFERENCES traffic_aggregation_jobs(id);
UPDATE lag_feature_samples AS sample
SET aggregation_id = generation.aggregation_id
FROM lag_feature_generations AS generation
WHERE sample.generation_id = generation.id AND sample.aggregation_id IS NULL;
ALTER TABLE lag_feature_samples ALTER COLUMN aggregation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_lag_samples_generation_session_time
    ON lag_feature_samples (generation_id, session_id, timestamp);

CREATE TABLE IF NOT EXISTS lag_feature_forests (
    id UUID PRIMARY KEY,
    generation_id UUID NOT NULL REFERENCES lag_feature_generations(id),
    split_strategy VARCHAR(32) NOT NULL,
    train_samples INTEGER NOT NULL,
    test_samples INTEGER NOT NULL,
    trained_through TIMESTAMPTZ NOT NULL,
    hyperparameters JSONB NOT NULL,
    metrics JSONB NOT NULL,
    artifact_path TEXT NOT NULL,
    artifact_sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_lag_forest_split CHECK (train_samples > 0 AND test_samples > 0)
);
