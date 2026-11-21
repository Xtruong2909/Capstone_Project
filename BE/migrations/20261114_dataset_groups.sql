-- Group pNEUMA datasets recorded by the same drone across different dates.
CREATE TABLE IF NOT EXISTS dataset_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source VARCHAR(255) NOT NULL,
    drone_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dataset_group_source_drone UNIQUE (source, drone_id)
);

ALTER TABLE datasets ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES dataset_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_datasets_group_id ON datasets(group_id);

INSERT INTO dataset_groups (source, drone_id)
SELECT DISTINCT lower(trim(source)), lower(trim(drone_id))
FROM datasets
WHERE drone_id IS NOT NULL AND recording_date IS NOT NULL
ON CONFLICT (source, drone_id) DO NOTHING;

UPDATE datasets AS dataset
SET group_id = groups.id
FROM dataset_groups AS groups
WHERE dataset.drone_id IS NOT NULL
  AND dataset.recording_date IS NOT NULL
  AND lower(trim(dataset.source)) = groups.source
  AND lower(trim(dataset.drone_id)) = groups.drone_id
  AND dataset.group_id IS DISTINCT FROM groups.id;
