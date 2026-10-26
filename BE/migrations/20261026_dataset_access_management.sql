-- Add dataset-wide grants without widening or deleting existing version grants.
-- Apply once using the existing SQL migration process, not init_db.sql.
BEGIN;
ALTER TABLE dataset_access_grants
    ADD COLUMN dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE;
ALTER TABLE dataset_access_grants ALTER COLUMN dataset_version_id DROP NOT NULL;
ALTER TABLE dataset_access_grants
    ADD CONSTRAINT uq_dataset_user_access UNIQUE (dataset_id, user_id),
    ADD CONSTRAINT ck_dataset_access_scope CHECK (
        (dataset_id IS NOT NULL AND dataset_version_id IS NULL) OR
        (dataset_id IS NULL AND dataset_version_id IS NOT NULL)
    );
CREATE INDEX ix_dataset_access_grants_user_id ON dataset_access_grants(user_id);
COMMIT;
