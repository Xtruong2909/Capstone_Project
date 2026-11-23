-- Persist multipart ownership, object keys and expiration independently of API results.
ALTER TABLE dataset_upload_jobs ADD COLUMN IF NOT EXISTS upload_state JSONB;
