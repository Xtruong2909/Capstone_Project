-- Add split-scoped experiment numbering and persist all three evaluation methods.
BEGIN;

CREATE TABLE IF NOT EXISTS model_training_split_experiment_counters (
    split_id UUID PRIMARY KEY REFERENCES lag_feature_splits(id) ON DELETE CASCADE,
    last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

INSERT INTO model_training_split_experiment_counters (split_id, last_number)
SELECT lag_feature_split_id, COALESCE(MAX(experiment_number), 0)
FROM model_training_experiments
WHERE lag_feature_split_id IS NOT NULL
GROUP BY lag_feature_split_id
ON CONFLICT (split_id) DO UPDATE
SET last_number = GREATEST(
    model_training_split_experiment_counters.last_number,
    EXCLUDED.last_number
);

ALTER TABLE model_training_experiments
    ADD COLUMN IF NOT EXISTS performance_by_model_and_horizon JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_training_split_experiment_number'
          AND conrelid = 'model_training_experiments'::regclass
    ) THEN
        ALTER TABLE model_training_experiments
            ADD CONSTRAINT uq_training_split_experiment_number
            UNIQUE (lag_feature_split_id, experiment_number);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_training_split_experiment_name'
          AND conrelid = 'model_training_experiments'::regclass
    ) THEN
        ALTER TABLE model_training_experiments
            ADD CONSTRAINT uq_training_split_experiment_name
            UNIQUE (lag_feature_split_id, name);
    END IF;
END $$;

ALTER TABLE model_training_forecast_results
    ALTER COLUMN model_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS model_type VARCHAR(32) NOT NULL DEFAULT 'RANDOM_FOREST';

ALTER TABLE model_training_forecast_results
    DROP CONSTRAINT IF EXISTS uq_training_forecast_sample_horizon;

ALTER TABLE model_training_forecast_results
    ADD CONSTRAINT uq_training_forecast_sample_horizon
    UNIQUE (experiment_id, session_id, input_timestamp, horizon, model_type);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_training_forecast_model_type'
          AND conrelid = 'model_training_forecast_results'::regclass
    ) THEN
        ALTER TABLE model_training_forecast_results
            ADD CONSTRAINT ck_training_forecast_model_type
            CHECK (model_type IN ('RANDOM_FOREST', 'PERSISTENCE', 'HISTORICAL_AVERAGE'));
    END IF;
END $$;

DROP INDEX IF EXISTS ix_training_forecast_experiment_horizon;
CREATE INDEX IF NOT EXISTS ix_training_forecast_experiment_model_horizon
    ON model_training_forecast_results(experiment_id, model_type, horizon);

COMMIT;
