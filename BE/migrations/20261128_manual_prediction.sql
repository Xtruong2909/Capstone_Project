CREATE TABLE IF NOT EXISTS prediction_runs (
    id UUID PRIMARY KEY,
    experiment_id UUID NOT NULL REFERENCES model_training_experiments(id),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    request_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('COMPLETED', 'PARTIAL')),
    requested_horizons JSONB NOT NULL,
    session_count INTEGER NOT NULL,
    session_snapshots JSONB NOT NULL,
    session_errors JSONB NOT NULL,
    model_artifacts JSONB NOT NULL,
    prediction_time_ms DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_prediction_run_experiment_created ON prediction_runs(experiment_id, created_at);

CREATE TABLE IF NOT EXISTS prediction_results (
    id UUID PRIMARY KEY,
    prediction_run_id UUID NOT NULL REFERENCES prediction_runs(id) ON DELETE CASCADE,
    experiment_id UUID NOT NULL REFERENCES model_training_experiments(id),
    model_id UUID NOT NULL REFERENCES experiment_trained_models(model_id),
    dataset_id UUID NOT NULL REFERENCES datasets(id),
    dataset_version_id UUID NOT NULL REFERENCES dataset_versions(id),
    session_id UUID NOT NULL REFERENCES recording_sessions(id),
    horizon INTEGER NOT NULL CHECK (horizon IN (1, 3, 5)),
    forecast_origin_time TIMESTAMPTZ NOT NULL,
    forecast_timestamp TIMESTAMPTZ NOT NULL,
    predicted_vehicle_count DOUBLE PRECISION NOT NULL CHECK (predicted_vehicle_count >= 0),
    actual_vehicle_count DOUBLE PRECISION,
    lag_features JSONB NOT NULL,
    artifact_sha256 VARCHAR(64) NOT NULL,
    prediction_time_ms DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_prediction_run_session_horizon UNIQUE (prediction_run_id, session_id, horizon)
);
CREATE INDEX IF NOT EXISTS ix_prediction_results_prediction_run_id ON prediction_results(prediction_run_id);
CREATE INDEX IF NOT EXISTS ix_prediction_result_session ON prediction_results(session_id, forecast_timestamp);
