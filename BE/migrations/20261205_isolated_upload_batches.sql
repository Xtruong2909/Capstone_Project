-- Existing batches retain their IDs and the legacy empty upload scope.
ALTER TABLE dataset_groups ADD COLUMN IF NOT EXISTS upload_scope VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE dataset_groups DROP CONSTRAINT IF EXISTS uq_dataset_group_source_drone;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'dataset_groups'::regclass
                     AND conname = 'uq_dataset_group_upload_scope') THEN
        ALTER TABLE dataset_groups ADD CONSTRAINT uq_dataset_group_upload_scope
            UNIQUE (source, drone_id, upload_scope);
    END IF;
END $$;
