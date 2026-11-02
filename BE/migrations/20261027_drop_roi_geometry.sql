-- Permanently remove dataset ROI polygons.
-- PostgreSQL also drops indexes on the removed column automatically.
-- No CASCADE: unexpected external dependencies must not be removed.
BEGIN;
ALTER TABLE public.datasets DROP COLUMN IF EXISTS roi_geometry;
COMMIT;
