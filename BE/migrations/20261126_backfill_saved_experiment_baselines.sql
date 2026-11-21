-- Evaluate previously completed split-scoped experiments on their saved Test samples.
-- No Random Forest refit and no Aggregation, Lag Feature, or Train/Test rewrite.
BEGIN;

WITH train_means AS (
    SELECT e.id AS experiment_id, horizon.value AS horizon,
           AVG(CASE horizon.value WHEN 1 THEN sample.target_h1
                                  WHEN 3 THEN sample.target_h3
                                  ELSE sample.target_h5 END)::DOUBLE PRECISION AS mean_count
    FROM model_training_experiments e
    JOIN lag_feature_split_samples split_sample
      ON split_sample.split_id = e.lag_feature_split_id AND split_sample.subset = 'TRAIN'
    JOIN lag_feature_samples sample ON sample.id = split_sample.sample_id
    CROSS JOIN (VALUES (1), (3), (5)) AS horizon(value)
    WHERE e.status = 'COMPLETED' AND e.lag_feature_split_id IS NOT NULL
    GROUP BY e.id, horizon.value
), baseline_values AS (
    SELECT rf.experiment_id, rf.dataset_id, rf.session_id, rf.input_timestamp,
           rf.forecast_timestamp, rf.actual_timestamp, rf.horizon,
           rf.actual_vehicle_count, baseline.model_type,
           CASE baseline.model_type WHEN 'PERSISTENCE' THEN sample.lag_1::DOUBLE PRECISION
                                    ELSE train_means.mean_count END AS predicted_vehicle_count
    FROM model_training_forecast_results rf
    JOIN model_training_experiments e ON e.id = rf.experiment_id
    JOIN lag_feature_split_samples split_sample
      ON split_sample.split_id = e.lag_feature_split_id AND split_sample.subset = 'TEST'
    JOIN lag_feature_samples sample ON sample.id = split_sample.sample_id
      AND sample.session_id = rf.session_id AND sample.timestamp = rf.input_timestamp
    JOIN train_means ON train_means.experiment_id = rf.experiment_id
      AND train_means.horizon = rf.horizon
    CROSS JOIN (VALUES ('PERSISTENCE'), ('HISTORICAL_AVERAGE')) AS baseline(model_type)
    WHERE rf.model_type = 'RANDOM_FOREST' AND e.status = 'COMPLETED'
)
INSERT INTO model_training_forecast_results (
    experiment_id, model_id, model_type, dataset_id, session_id,
    input_timestamp, forecast_timestamp, actual_timestamp, horizon,
    actual_vehicle_count, predicted_vehicle_count, absolute_error, squared_error
)
SELECT experiment_id, NULL, model_type, dataset_id, session_id,
       input_timestamp, forecast_timestamp, actual_timestamp, horizon,
       actual_vehicle_count, predicted_vehicle_count,
       ABS(actual_vehicle_count - predicted_vehicle_count),
       POWER(actual_vehicle_count - predicted_vehicle_count, 2)
FROM baseline_values
ON CONFLICT ON CONSTRAINT uq_training_forecast_sample_horizon DO NOTHING;

WITH train_means AS (
    SELECT e.id AS experiment_id, horizon.value AS horizon,
           AVG(CASE horizon.value WHEN 1 THEN sample.target_h1
                                  WHEN 3 THEN sample.target_h3
                                  ELSE sample.target_h5 END)::DOUBLE PRECISION AS mean_count
    FROM model_training_experiments e
    JOIN lag_feature_split_samples split_sample
      ON split_sample.split_id = e.lag_feature_split_id AND split_sample.subset = 'TRAIN'
    JOIN lag_feature_samples sample ON sample.id = split_sample.sample_id
    CROSS JOIN (VALUES (1), (3), (5)) AS horizon(value)
    WHERE e.status = 'COMPLETED' AND e.lag_feature_split_id IS NOT NULL
    GROUP BY e.id, horizon.value
), means_by_experiment AS (
    SELECT experiment_id, jsonb_object_agg(horizon::TEXT, mean_count) AS means
    FROM train_means GROUP BY experiment_id
)
UPDATE model_training_experiments e
SET configuration = jsonb_set(
    e.configuration, '{historical_average_train_target_means}', means_by_experiment.means, TRUE
)
FROM means_by_experiment
WHERE e.id = means_by_experiment.experiment_id
  AND NOT e.configuration ? 'historical_average_train_target_means';

WITH horizon_metrics AS (
    SELECT experiment_id, model_type, horizon,
           COUNT(*) AS sample_count,
           AVG(absolute_error) AS mae,
           AVG(squared_error) AS mse,
           SQRT(AVG(squared_error)) AS rmse
    FROM model_training_forecast_results
    GROUP BY experiment_id, model_type, horizon
), by_model AS (
    SELECT experiment_id, model_type,
           jsonb_object_agg(horizon::TEXT, jsonb_build_object(
               'sample_count', sample_count, 'mae', mae, 'mse', mse, 'rmse', rmse
           )) AS horizon_metrics
    FROM horizon_metrics GROUP BY experiment_id, model_type
), by_experiment AS (
    SELECT experiment_id, jsonb_object_agg(model_type, horizon_metrics) AS metrics
    FROM by_model GROUP BY experiment_id
)
UPDATE model_training_experiments e
SET performance_by_model_and_horizon = by_experiment.metrics
FROM by_experiment
WHERE e.id = by_experiment.experiment_id
  AND e.lag_feature_split_id IS NOT NULL
  AND e.performance_by_model_and_horizon = '{}'::jsonb;

WITH rows_by_experiment AS (
    SELECT experiment_id,
           jsonb_agg(jsonb_build_object(
               'model', model_type,
               'horizon_minutes', horizon,
               'forecast_origin_time', input_timestamp,
               'target_timestamp', forecast_timestamp,
               'actual_traffic_flow', actual_vehicle_count,
               'predicted_traffic_flow', predicted_vehicle_count,
               'absolute_error', absolute_error,
               'squared_error', squared_error,
               'dataset_id', dataset_id,
               'session_id', session_id
           ) ORDER BY input_timestamp, session_id, model_type, horizon) AS rows
    FROM model_training_forecast_results
    GROUP BY experiment_id
)
UPDATE model_training_experiments e
SET prediction_rows = rows_by_experiment.rows
FROM rows_by_experiment
WHERE e.id = rows_by_experiment.experiment_id
  AND e.lag_feature_split_id IS NOT NULL
  AND NOT e.prediction_rows @> '[{"model":"PERSISTENCE"}]'::jsonb;

COMMIT;
