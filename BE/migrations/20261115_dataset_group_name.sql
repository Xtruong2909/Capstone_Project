-- Allow a human-readable name for an existing source/drone dataset group.
ALTER TABLE dataset_groups ADD COLUMN IF NOT EXISTS name VARCHAR(128);
