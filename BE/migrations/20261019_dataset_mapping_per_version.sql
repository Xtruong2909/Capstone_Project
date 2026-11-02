ALTER TABLE dataset_column_mappings
    DROP CONSTRAINT IF EXISTS dataset_column_mappings_dataset_id_key;

ALTER TABLE dataset_column_mappings
    DROP CONSTRAINT IF EXISTS uq_dataset_column_mapping_version;

ALTER TABLE dataset_column_mappings
    ADD CONSTRAINT uq_dataset_column_mapping_version
    UNIQUE (dataset_id, dataset_version_id);
