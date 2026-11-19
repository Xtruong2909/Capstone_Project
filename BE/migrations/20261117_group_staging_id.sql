-- One logical staging ID belongs to the entire group normalization run.
-- Per-Dataset staging file IDs remain internal in the job results JSON.
ALTER TABLE dataset_group_processing_jobs ADD COLUMN IF NOT EXISTS staging_id UUID;

UPDATE dataset_group_processing_jobs
SET staging_id = id
WHERE operation = 'NORMALIZE' AND staging_id IS NULL;

UPDATE dataset_group_processing_jobs AS export_job
SET staging_id = (
    SELECT normalize_job.id
    FROM dataset_group_processing_jobs AS normalize_job
    WHERE normalize_job.group_id = export_job.group_id
      AND normalize_job.operation = 'NORMALIZE'
      AND normalize_job.created_at <= export_job.created_at
    ORDER BY normalize_job.created_at DESC
    LIMIT 1
)
WHERE export_job.operation = 'EXPORT' AND export_job.staging_id IS NULL;

ALTER TABLE dataset_group_processing_jobs ALTER COLUMN staging_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ix_dataset_group_processing_jobs_staging_id
    ON dataset_group_processing_jobs(staging_id);
