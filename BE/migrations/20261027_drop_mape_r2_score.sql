-- Retain MAE and RMSE; permanently remove the MAPE and R2 values.
-- No CASCADE: do not remove unexpected dependent objects.
BEGIN;
ALTER TABLE public.evaluation_metrics
    DROP COLUMN IF EXISTS mape,
    DROP COLUMN IF EXISTS r2_score;
COMMIT;
