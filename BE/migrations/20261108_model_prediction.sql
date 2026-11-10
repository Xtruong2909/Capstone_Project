-- Extend the legacy forecast table without rewriting or deleting legacy rows.
-- Validation scores must be generated on a separate Validation set; Test metrics
-- in model_training_experiments are never copied here.
BEGIN;

CREATE TABLE IF NOT EXISTS model_validation_results (
    experiment_id UUID PRIMARY KEY REFERENCES model_training_experiments(id),
    validation_fingerprint VARCHAR(64) NOT NULL,
    sample_count INTEGER NOT NULL CHECK (sample_count > 0),
    performance_by_horizon JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS final_models (
    id UUID PRIMARY KEY,
    experiment_id UUID NOT NULL UNIQUE REFERENCES model_training_experiments(id),
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id),
    split_id UUID NOT NULL REFERENCES model_training_splits(id),
    roi_identifier VARCHAR(64) NOT NULL,
    recording_session_id VARCHAR(255) NOT NULL,
    artifact_path TEXT NOT NULL,
    artifact_sha256 VARCHAR(64) NOT NULL,
    trained_through TIMESTAMPTZ NOT NULL,
    feature_order JSONB NOT NULL,
    forecast_horizons JSONB NOT NULL,
    hyperparameters JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_final_model_sha256 CHECK (artifact_sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE forecast_results
    ALTER COLUMN experiment_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES final_models(id),
    ADD COLUMN IF NOT EXISTS last_observed_time TIMESTAMPTZ;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_forecast_source'
        AND conrelid = 'forecast_results'::regclass) THEN
        ALTER TABLE forecast_results ADD CONSTRAINT ck_forecast_source CHECK (
            (experiment_id IS NOT NULL AND model_id IS NULL)
            OR (experiment_id IS NULL AND model_id IS NOT NULL AND last_observed_time IS NOT NULL)
        );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_final_origin_horizon
    ON forecast_results(model_id, last_observed_time, horizon_minutes)
    WHERE model_id IS NOT NULL;

COMMIT;
