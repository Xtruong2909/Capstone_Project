-- Match the upload flow: store paths relative to DATASET_UPLOAD_DIR.
-- This migration targets the existing Docker root only; custom roots are unchanged.
-- File contents and their locations are not changed.
BEGIN;
UPDATE public.dataset_versions
SET data_file_path = substring(data_file_path FROM length('/app/uploads/datasets/') + 1)
WHERE starts_with(data_file_path, '/app/uploads/datasets/');

UPDATE public.dataset_versions
SET csv_file_path = substring(csv_file_path FROM length('/app/uploads/datasets/') + 1)
WHERE starts_with(csv_file_path, '/app/uploads/datasets/');

UPDATE public.dataset_versions
SET parquet_file_path = substring(parquet_file_path FROM length('/app/uploads/datasets/') + 1)
WHERE starts_with(parquet_file_path, '/app/uploads/datasets/');
COMMIT;
