ALTER TABLE dataset_versions
    ADD COLUMN IF NOT EXISTS data_file_path VARCHAR(512),
    ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
