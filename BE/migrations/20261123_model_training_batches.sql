-- Add batch-managed experiments without removing or renaming existing experiments.
BEGIN;

CREATE TABLE IF NOT EXISTS experiment_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lag_feature_split_id UUID REFERENCES lag_feature_splits(id),
    legacy_split_id UUID REFERENCES model_training_splits(id),
    description TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'ARCHIVED', 'LEGACY')),
    next_sequence_number INTEGER NOT NULL DEFAULT 1
        CHECK (next_sequence_number > 0),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_experiment_batch_split_source CHECK (
        (lag_feature_split_id IS NOT NULL AND legacy_split_id IS NULL)
        OR (lag_feature_split_id IS NULL AND legacy_split_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS ix_experiment_batches_lag_split
    ON experiment_batches(lag_feature_split_id);
CREATE INDEX IF NOT EXISTS ix_experiment_batches_legacy_split
    ON experiment_batches(legacy_split_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_experiment_batches_legacy_split
    ON experiment_batches(legacy_split_id)
    WHERE legacy_split_id IS NOT NULL;

ALTER TABLE model_training_experiments
    ALTER COLUMN dataset_id DROP NOT NULL,
    ALTER COLUMN split_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS lag_feature_split_id UUID REFERENCES lag_feature_splits(id),
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES experiment_batches(batch_id),
    ADD COLUMN IF NOT EXISTS experiment_number INTEGER,
    ADD COLUMN IF NOT EXISTS training_time_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS prediction_time_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE model_training_experiments
    DROP CONSTRAINT IF EXISTS ck_training_status,
    ADD CONSTRAINT ck_training_status
        CHECK (status IN ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'));

ALTER TABLE model_training_experiments
    DROP CONSTRAINT IF EXISTS uq_training_experiment_dataset_name;

INSERT INTO experiment_batches (
    batch_id, legacy_split_id, description, status, next_sequence_number
)
SELECT
    gen_random_uuid(),
    experiment.split_id,
    'Migrated legacy experiment batch',
    'LEGACY',
    COALESCE(MAX(NULLIF(substring(experiment.name FROM '^Ex-([0-9]+)$'), '')::INTEGER), 0) + 1
FROM model_training_experiments AS experiment
WHERE experiment.split_id IS NOT NULL
GROUP BY experiment.split_id
ON CONFLICT (legacy_split_id) WHERE legacy_split_id IS NOT NULL DO NOTHING;

UPDATE model_training_experiments AS experiment
SET batch_id = batch.batch_id,
    experiment_number = CASE
        WHEN experiment.name ~ '^Ex-[0-9]+$'
        THEN substring(experiment.name FROM '^Ex-([0-9]+)$')::INTEGER
        ELSE NULL
    END
FROM experiment_batches AS batch
WHERE batch.legacy_split_id = experiment.split_id
  AND experiment.batch_id IS NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_training_experiment_split_source'
          AND conrelid = 'model_training_experiments'::regclass
    ) THEN
        ALTER TABLE model_training_experiments
            ADD CONSTRAINT ck_training_experiment_split_source CHECK (
                (split_id IS NOT NULL AND lag_feature_split_id IS NULL)
                OR (split_id IS NULL AND lag_feature_split_id IS NOT NULL)
            );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_training_batch_number'
          AND conrelid = 'model_training_experiments'::regclass
    ) THEN
        ALTER TABLE model_training_experiments
            ADD CONSTRAINT uq_training_batch_number UNIQUE (batch_id, experiment_number);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_training_batch_name'
          AND conrelid = 'model_training_experiments'::regclass
    ) THEN
        ALTER TABLE model_training_experiments
            ADD CONSTRAINT uq_training_batch_name UNIQUE (batch_id, name);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_model_training_experiments_batch_id
    ON model_training_experiments(batch_id);
CREATE INDEX IF NOT EXISTS ix_model_training_experiments_lag_split_id
    ON model_training_experiments(lag_feature_split_id);

CREATE TABLE IF NOT EXISTS experiment_trained_models (
    model_id UUID PRIMARY KEY,
    experiment_id UUID NOT NULL
        REFERENCES model_training_experiments(id) ON DELETE CASCADE,
    horizon INTEGER NOT NULL CHECK (horizon IN (1, 3, 5)),
    model_type VARCHAR(32) NOT NULL DEFAULT 'RANDOM_FOREST',
    hyperparameters JSONB NOT NULL,
    training_time_ms DOUBLE PRECISION,
    artifact_reference TEXT,
    lag_feature_forest_id UUID REFERENCES lag_feature_forests(id),
    status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED'
        CHECK (status IN ('COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_experiment_model_horizon UNIQUE (experiment_id, horizon)
);
CREATE INDEX IF NOT EXISTS ix_experiment_trained_model_experiment
    ON experiment_trained_models(experiment_id, horizon);

CREATE TABLE IF NOT EXISTS model_training_forecast_results (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    experiment_id UUID NOT NULL
        REFERENCES model_training_experiments(id) ON DELETE CASCADE,
    model_id UUID NOT NULL
        REFERENCES experiment_trained_models(model_id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES datasets(id),
    session_id UUID NOT NULL REFERENCES recording_sessions(id),
    input_timestamp TIMESTAMPTZ NOT NULL,
    forecast_timestamp TIMESTAMPTZ NOT NULL,
    horizon INTEGER NOT NULL CHECK (horizon IN (1, 3, 5)),
    actual_vehicle_count DOUBLE PRECISION NOT NULL CHECK (actual_vehicle_count >= 0),
    predicted_vehicle_count DOUBLE PRECISION NOT NULL CHECK (predicted_vehicle_count >= 0),
    absolute_error DOUBLE PRECISION NOT NULL CHECK (absolute_error >= 0),
    CONSTRAINT uq_training_forecast_sample_horizon
        UNIQUE (experiment_id, session_id, input_timestamp, horizon)
);
CREATE INDEX IF NOT EXISTS ix_training_forecast_experiment_horizon
    ON model_training_forecast_results(experiment_id, horizon);

COMMIT;
