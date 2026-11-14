-- Persist all per-sample errors and explicit observed target timestamps.
BEGIN;

ALTER TABLE model_training_forecast_results
    ADD COLUMN IF NOT EXISTS actual_timestamp TIMESTAMPTZ;
ALTER TABLE model_training_forecast_results
    ADD COLUMN IF NOT EXISTS squared_error DOUBLE PRECISION;

-- Earlier results used forecast_timestamp as the observed target timestamp.
UPDATE model_training_forecast_results
SET actual_timestamp = forecast_timestamp
WHERE actual_timestamp IS NULL;
UPDATE model_training_forecast_results
SET squared_error = absolute_error * absolute_error
WHERE squared_error IS NULL;

ALTER TABLE model_training_forecast_results
    ALTER COLUMN actual_timestamp SET NOT NULL,
    ALTER COLUMN squared_error SET NOT NULL;

COMMIT;
