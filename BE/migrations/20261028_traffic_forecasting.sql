-- Run once on the OLD schema using psql -v ON_ERROR_STOP=1 -f this_file.sql.
-- Transactional, no row deletion, no historical experiment relabelling.
-- REVIEW_REQUIRED entries in error DETAIL identify rows needing manual review.
BEGIN;
LOCK TABLE experiments, forecast_results, evaluation_metrics, traffic_time_series
    IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE issues jsonb;
BEGIN
    SELECT jsonb_agg(issue) INTO issues FROM (
        SELECT jsonb_build_object('table', 'experiments', 'id', id,
            'flag', 'REVIEW_REQUIRED',
            'reason', 'Unsupported config or unverified historical split strategy',
            'horizon_seconds', forecast_horizon_steps::bigint * temporal_aggregation_sec) AS issue
        FROM experiments
        WHERE model_type NOT IN ('RANDOM_FOREST', 'PERSISTENCE', 'HISTORICAL_AVERAGE')
           OR target_variable <> 'traffic_flow' OR temporal_aggregation_sec <> 60
           OR forecast_horizon_steps NOT IN (1, 3, 5) OR train_split_ratio <> 0.70
           OR status <> 'DRAFT'
        UNION ALL
        SELECT jsonb_build_object('table', 'forecast_results', 'id', f.id,
            'flag', 'REVIEW_REQUIRED', 'reason', 'Invalid horizon or ambiguous target timestamp',
            'horizon_seconds', f.step_ahead::bigint * e.temporal_aggregation_sec)
        FROM forecast_results f JOIN experiments e ON e.id = f.experiment_id
        WHERE f.step_ahead NOT IN (1, 3, 5) OR f.step_ahead <> e.forecast_horizon_steps
           OR e.temporal_aggregation_sec <> 60
           -- Old schema never declared target timestamp semantics; require review.
           OR f.timestamp IS NOT NULL
        UNION ALL
        SELECT jsonb_build_object('table', 'traffic_time_series', 'id', id,
            'flag', 'REVIEW_REQUIRED', 'reason', 'Non-minute interval or invalid measurements')
        FROM traffic_time_series
        WHERE aggregation_interval <> 60 OR vehicle_count < 0
           OR NOT (traffic_flow >= 0 AND traffic_flow < 'Infinity')
           OR NOT (traffic_density >= 0 AND traffic_density < 'Infinity')
           OR NOT (mean_speed >= 0 AND mean_speed < 'Infinity')
        UNION ALL
        SELECT jsonb_build_object('table', 'traffic_time_series', 'id', id,
            'flag', 'REVIEW_REQUIRED', 'reason', 'Duplicate dataset/ROI/timestamp')
        FROM (SELECT id, count(*) OVER (
            PARTITION BY dataset_version_id, roi_identifier, time_bucket) AS copies
            FROM traffic_time_series) duplicates WHERE copies > 1
        UNION ALL
        SELECT jsonb_build_object('table', 'evaluation_metrics', 'id', id,
            'flag', 'REVIEW_REQUIRED', 'reason', 'Unverified historical testing-only evaluation')
        FROM evaluation_metrics
    ) flagged;
    IF issues IS NOT NULL THEN
        RAISE EXCEPTION 'Migration blocked: preserve and review legacy research data first'
            USING DETAIL = issues::text,
            HINT = 'Save this REVIEW_REQUIRED report. Do not coerce model/split/status or delete records to pass migration. Retain old database until an explicit archival/remediation plan is approved.';
    END IF;
END $$;

ALTER TABLE experiments RENAME COLUMN forecast_horizon_steps TO forecast_horizon_minutes;
-- Preflight established 60 seconds per step for every remaining experiment.
ALTER TABLE experiments
    ALTER COLUMN train_split_ratio SET DEFAULT 0.70,
    ADD COLUMN split_strategy varchar(32) NOT NULL DEFAULT 'CHRONOLOGICAL',
    ADD COLUMN run_config jsonb,
    ADD CONSTRAINT ck_experiment_model CHECK (model_type IN ('RANDOM_FOREST', 'PERSISTENCE', 'HISTORICAL_AVERAGE')),
    ADD CONSTRAINT ck_experiment_target CHECK (target_variable = 'traffic_flow'),
    ADD CONSTRAINT ck_experiment_interval CHECK (temporal_aggregation_sec = 60),
    ADD CONSTRAINT ck_experiment_horizon CHECK (forecast_horizon_minutes IN (1, 3, 5)),
    ADD CONSTRAINT ck_experiment_split CHECK (train_split_ratio = 0.70),
    ADD CONSTRAINT ck_experiment_strategy CHECK (split_strategy = 'CHRONOLOGICAL'),
    ADD CONSTRAINT uq_experiment_horizon UNIQUE (id, forecast_horizon_minutes);

ALTER TABLE forecast_results RENAME COLUMN step_ahead TO horizon_minutes;
ALTER TABLE forecast_results
    ADD CONSTRAINT ck_forecast_horizon CHECK (horizon_minutes IN (1, 3, 5)),
    ADD CONSTRAINT fk_forecast_horizon FOREIGN KEY (experiment_id, horizon_minutes)
        REFERENCES experiments(id, forecast_horizon_minutes) ON DELETE CASCADE,
    ADD CONSTRAINT uq_forecast_target UNIQUE (experiment_id, timestamp);
COMMENT ON COLUMN forecast_results.timestamp IS 'Forecast target bucket start timestamp';

-- Previous metric-removal migration must already be applied. Never silently
-- discard populated legacy MAPE/R2 columns here.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
        AND table_name = 'evaluation_metrics' AND column_name NOT IN
        ('id', 'experiment_id', 'mae', 'rmse', 'evaluated_at')) THEN
        RAISE EXCEPTION 'Review legacy evaluation metric columns before this migration';
    END IF;
END $$;
ALTER TABLE evaluation_metrics
    ADD CONSTRAINT ck_metric_mae CHECK (mae >= 0 AND mae < 'Infinity'),
    ADD CONSTRAINT ck_metric_rmse CHECK (rmse >= 0 AND rmse < 'Infinity');

ALTER TABLE traffic_time_series
    ALTER COLUMN aggregation_interval SET DEFAULT 60,
    ALTER COLUMN vehicle_count DROP DEFAULT, ALTER COLUMN vehicle_count DROP NOT NULL,
    ALTER COLUMN traffic_flow DROP DEFAULT, ALTER COLUMN traffic_flow DROP NOT NULL,
    ALTER COLUMN traffic_density DROP DEFAULT, ALTER COLUMN traffic_density DROP NOT NULL,
    ALTER COLUMN mean_speed DROP DEFAULT, ALTER COLUMN mean_speed DROP NOT NULL,
    ALTER COLUMN congestion_level DROP DEFAULT, ALTER COLUMN congestion_level DROP NOT NULL,
    ADD CONSTRAINT ck_traffic_interval CHECK (aggregation_interval = 60),
    ADD CONSTRAINT ck_traffic_count CHECK (vehicle_count >= 0),
    ADD CONSTRAINT ck_traffic_flow CHECK (traffic_flow >= 0 AND traffic_flow < 'Infinity'),
    ADD CONSTRAINT ck_traffic_density CHECK (traffic_density >= 0 AND traffic_density < 'Infinity'),
    ADD CONSTRAINT ck_traffic_speed CHECK (mean_speed >= 0 AND mean_speed < 'Infinity'),
    ADD CONSTRAINT uq_traffic_bucket UNIQUE (dataset_version_id, roi_identifier, time_bucket);
COMMENT ON COLUMN traffic_time_series.traffic_flow IS 'Verified counting-line passages/minute; legacy values are unverified';
COMMENT ON COLUMN traffic_time_series.vehicle_count IS 'Passage events, not trajectory row counts; counting rule required';
COMMENT ON COLUMN traffic_time_series.traffic_density IS 'Method and units not defined yet; new observations must use NULL';
COMMENT ON COLUMN traffic_time_series.mean_speed IS 'km/h; convert m/s source values by 3.6 only when source unit is known';
COMMIT;
