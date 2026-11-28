BEGIN;
ALTER TABLE lag_feature_splits ADD COLUMN IF NOT EXISTS purpose VARCHAR(16) NOT NULL DEFAULT 'STANDARD';
CREATE TABLE IF NOT EXISTS validation_studies (
    id UUID PRIMARY KEY,
    created_by UUID NOT NULL REFERENCES users(id),
    feature_generation_id UUID NOT NULL REFERENCES lag_feature_generations(id) ON DELETE CASCADE,
    validation_split_id UUID NOT NULL REFERENCES lag_feature_splits(id) ON DELETE CASCADE,
    final_split_id UUID NOT NULL REFERENCES lag_feature_splits(id) ON DELETE CASCADE,
    status VARCHAR(24) NOT NULL DEFAULT 'READY',
    protocol JSONB NOT NULL,
    candidates JSONB NOT NULL,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE validation_studies DROP CONSTRAINT IF EXISTS validation_studies_feature_generation_id_fkey;
ALTER TABLE validation_studies ADD CONSTRAINT validation_studies_feature_generation_id_fkey
    FOREIGN KEY (feature_generation_id) REFERENCES lag_feature_generations(id) ON DELETE CASCADE;
ALTER TABLE validation_studies DROP CONSTRAINT IF EXISTS validation_studies_validation_split_id_fkey;
ALTER TABLE validation_studies ADD CONSTRAINT validation_studies_validation_split_id_fkey
    FOREIGN KEY (validation_split_id) REFERENCES lag_feature_splits(id) ON DELETE CASCADE;
ALTER TABLE validation_studies DROP CONSTRAINT IF EXISTS validation_studies_final_split_id_fkey;
ALTER TABLE validation_studies ADD CONSTRAINT validation_studies_final_split_id_fkey
    FOREIGN KEY (final_split_id) REFERENCES lag_feature_splits(id) ON DELETE CASCADE;
COMMIT;
