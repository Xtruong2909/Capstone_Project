-- Restart experiment numbering for each dataset while keeping the global identity for ordering.
BEGIN;

ALTER TABLE model_training_experiments
    ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES datasets(id);

UPDATE model_training_experiments AS experiment
SET dataset_id = dataset_version.dataset_id
FROM model_training_splits AS split
JOIN dataset_versions AS dataset_version
    ON dataset_version.id = split.dataset_version_id
WHERE experiment.split_id = split.id
  AND experiment.dataset_id IS NULL;

ALTER TABLE model_training_experiments
    ALTER COLUMN dataset_id SET NOT NULL;

ALTER TABLE model_training_experiments
    DROP CONSTRAINT IF EXISTS model_training_experiments_name_key;
ALTER TABLE model_training_experiments
    DROP CONSTRAINT IF EXISTS uq_training_experiment_dataset_name;
ALTER TABLE model_training_experiments
    DROP COLUMN IF EXISTS name;
ALTER TABLE model_training_experiments
    ADD COLUMN name VARCHAR(64);

WITH numbered_experiments AS (
    SELECT id, row_number() OVER (PARTITION BY dataset_id ORDER BY number) AS dataset_number
    FROM model_training_experiments
)
UPDATE model_training_experiments AS experiment
SET name = 'Ex-' || lpad(numbered_experiments.dataset_number::text, 3, '0')
FROM numbered_experiments
WHERE experiment.id = numbered_experiments.id;

ALTER TABLE model_training_experiments
    ALTER COLUMN name SET NOT NULL;
ALTER TABLE model_training_experiments
    ADD CONSTRAINT uq_training_experiment_dataset_name UNIQUE (dataset_id, name);

COMMIT;
