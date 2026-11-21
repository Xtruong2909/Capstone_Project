BEGIN;

CREATE TABLE IF NOT EXISTS lag_feature_splits (
    id UUID PRIMARY KEY,
    feature_generation_id UUID NOT NULL REFERENCES lag_feature_generations(id),
    configuration_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED'
        CHECK (status IN ('COMPLETED')),
    split_strategy VARCHAR(16) NOT NULL
        CHECK (split_strategy IN ('DAY_BASED', 'SESSION_BASED')),
    train_ratio_requested DOUBLE PRECISION NOT NULL
        CHECK (train_ratio_requested > 0 AND train_ratio_requested < 1),
    train_ratio_actual DOUBLE PRECISION NOT NULL
        CHECK (train_ratio_actual > 0 AND train_ratio_actual < 1),
    shuffle BOOLEAN NOT NULL DEFAULT FALSE CHECK (shuffle = FALSE),
    forecast_horizons JSONB NOT NULL,
    total_sessions INTEGER NOT NULL CHECK (total_sessions >= 2),
    train_sessions JSONB NOT NULL,
    test_sessions JSONB NOT NULL,
    total_samples INTEGER NOT NULL,
    train_sample_count INTEGER NOT NULL,
    test_sample_count INTEGER NOT NULL,
    samples_by_horizon JSONB NOT NULL,
    leakage_check JSONB NOT NULL,
    warnings JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_lag_split_sample_counts CHECK (
        total_samples = train_sample_count + test_sample_count
        AND train_sample_count > 0 AND test_sample_count > 0
    ),
    CONSTRAINT uq_lag_split_generation_config
        UNIQUE (feature_generation_id, configuration_hash)
);

CREATE TABLE IF NOT EXISTS lag_feature_split_samples (
    split_id UUID NOT NULL REFERENCES lag_feature_splits(id) ON DELETE CASCADE,
    sample_id BIGINT NOT NULL REFERENCES lag_feature_samples(id) ON DELETE CASCADE,
    subset VARCHAR(5) NOT NULL CHECK (subset IN ('TRAIN', 'TEST')),
    PRIMARY KEY (split_id, sample_id)
);
CREATE INDEX IF NOT EXISTS ix_lag_split_sample_subset
    ON lag_feature_split_samples (split_id, subset, sample_id);

ALTER TABLE lag_feature_forests
    ADD COLUMN IF NOT EXISTS split_id UUID REFERENCES lag_feature_splits(id);
CREATE INDEX IF NOT EXISTS ix_lag_feature_forests_split_id
    ON lag_feature_forests (split_id);

COMMIT;
