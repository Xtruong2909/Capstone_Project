-- Direct S3 uploads do not re-read object bodies to calculate SHA-256.
-- NULL means content checksum was not calculated, never an invented checksum.
-- Existing checksum values and unique constraints are preserved.
ALTER TABLE recording_sessions ALTER COLUMN checksum DROP NOT NULL;
