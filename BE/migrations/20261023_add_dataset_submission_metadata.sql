ALTER TABLE dataset_versions
    ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

UPDATE dataset_versions
SET approval_status = 'PENDING'
WHERE approval_status = 'SUBMITTED'
  AND (submitted_by IS NULL OR submitted_at IS NULL);
