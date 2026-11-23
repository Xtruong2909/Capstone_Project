-- Submission permanently disables deleting the batch, even after file status resets.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE dataset_groups ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ;
UPDATE dataset_groups g
SET first_submitted_at = history.first_submitted_at
FROM (
    SELECT group_id, min(submitted_at) AS first_submitted_at
    FROM (
        SELECT d.group_id, COALESCE(f.submitted_at, f.created_at, g.created_at) AS submitted_at
        FROM datasets d JOIN dataset_groups g ON g.id=d.group_id
        JOIN dataset_files f ON f.dataset_id=d.id
        WHERE f.submitted_at IS NOT NULL OR f.submitted_by IS NOT NULL
           OR f.approved_by IS NOT NULL OR f.approval_status IN ('SUBMITTED','APPROVED','REJECTED')
        UNION ALL
        SELECT g.id, a.created_at
        FROM dataset_groups g JOIN audit_logs a ON a.resource_id=g.id::text
        WHERE a.status='SUCCESS' AND a.action IN
            ('SUBMIT_DATASET_GROUP_FOR_REVIEW','RESUBMIT_DATASET_GROUP_FOR_REVIEW')
    ) evidence
    GROUP BY group_id
) history
WHERE g.id=history.group_id AND g.first_submitted_at IS NULL;
COMMIT;
