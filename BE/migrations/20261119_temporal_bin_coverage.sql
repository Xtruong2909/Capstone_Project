-- Preserve all existing time bins. Old runs have no verified capture coverage.
ALTER TABLE traffic_time_series
    ADD COLUMN IF NOT EXISTS coverage_seconds NUMERIC(8, 3),
    ADD COLUMN IF NOT EXISTS bin_status VARCHAR(12) NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS eligible_for_training BOOLEAN;

ALTER TABLE traffic_time_series
    DROP CONSTRAINT IF EXISTS ck_traffic_bin_coverage;
ALTER TABLE traffic_time_series
    ADD CONSTRAINT ck_traffic_bin_coverage CHECK (
        coverage_seconds IS NULL
        OR (coverage_seconds >= 0 AND coverage_seconds <= aggregation_interval)
    );
ALTER TABLE traffic_time_series
    DROP CONSTRAINT IF EXISTS ck_traffic_bin_status;
ALTER TABLE traffic_time_series
    ADD CONSTRAINT ck_traffic_bin_status CHECK (
        bin_status IN ('COMPLETE', 'INCOMPLETE', 'UNKNOWN')
    );
ALTER TABLE traffic_time_series
    DROP CONSTRAINT IF EXISTS ck_traffic_training_eligibility;
ALTER TABLE traffic_time_series
    ADD CONSTRAINT ck_traffic_training_eligibility CHECK (
        (bin_status = 'COMPLETE' AND coverage_seconds = aggregation_interval
            AND eligible_for_training IS TRUE)
        OR (bin_status = 'INCOMPLETE' AND coverage_seconds < aggregation_interval
            AND eligible_for_training IS FALSE)
        OR (bin_status = 'UNKNOWN' AND coverage_seconds IS NULL
            AND eligible_for_training IS NULL)
    );
