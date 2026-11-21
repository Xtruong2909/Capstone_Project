-- Add persisted progress logs to existing Data Scientist training experiments.
ALTER TABLE model_training_experiments
    ADD COLUMN IF NOT EXISTS logs JSONB NOT NULL DEFAULT '[]';
