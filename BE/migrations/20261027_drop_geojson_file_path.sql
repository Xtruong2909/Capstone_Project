-- Remove the dedicated GeoJSON path; retain the other file path columns.
-- Any values stored in this column are permanently removed.
BEGIN;
ALTER TABLE public.dataset_versions DROP COLUMN IF EXISTS geojson_file_path;
COMMIT;
