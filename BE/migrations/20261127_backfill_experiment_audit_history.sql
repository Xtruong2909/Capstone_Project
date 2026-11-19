-- Add an explicitly marked history entry for experiments completed before
-- RUN_EXPERIMENT audit events were introduced. Safe to re-run.
INSERT INTO audit_logs (
    id, user_id, username, action, module, status, description,
    resource_type, resource_id, details, created_at
)
SELECT
    gen_random_uuid(), e.created_by, u.full_name,
    'IMPORT_EXPERIMENT_HISTORY', 'Model Training',
    CASE WHEN e.status = 'COMPLETED' THEN 'SUCCESS' ELSE 'FAILED' END,
    e.name || ' historical result imported',
    'MODEL_TRAINING', e.id::text,
    jsonb_build_object(
        'historical_backfill', true,
        'experiment_name', e.name,
        'original_status', e.status,
        'original_created_at', e.created_at,
        'original_completed_at', e.completed_at,
        'split_id', COALESCE(e.lag_feature_split_id, e.split_id)::text
    ),
    now()
FROM model_training_experiments e
LEFT JOIN users u ON u.id = e.created_by
WHERE e.status IN ('COMPLETED', 'FAILED')
  AND NOT EXISTS (
      SELECT 1 FROM audit_logs a
      WHERE a.module = 'Model Training'
        AND a.resource_id = e.id::text
        AND a.action IN ('RUN_EXPERIMENT', 'IMPORT_EXPERIMENT_HISTORY')
  );
