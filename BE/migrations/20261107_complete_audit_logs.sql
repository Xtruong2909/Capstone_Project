-- Extend existing audit history in place; no log rows are removed.
BEGIN;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(100) NOT NULL DEFAULT 'System',
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    description TEXT,
    resource_type VARCHAR(64) NOT NULL DEFAULT 'SYSTEM',
    resource_id VARCHAR(255),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_audit_logs_status CHECK (status IN ('SUCCESS', 'FAILED'))
);

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS username VARCHAR(255),
    ADD COLUMN IF NOT EXISTS module VARCHAR(100) NOT NULL DEFAULT 'System',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    ADD COLUMN IF NOT EXISTS description TEXT;

UPDATE audit_logs AS log
SET username = users.full_name
FROM users
WHERE log.user_id = users.id AND log.username IS NULL;

UPDATE audit_logs
SET module = CASE
    WHEN action IN ('LOGIN', 'LOGIN_FAILED', 'LOGOUT') THEN 'Authentication'
    WHEN action IN ('CREATE_USER', 'UPDATE_USER', 'UPDATE_USER_STATUS', 'DELETE_USER', 'CHANGE_ROLE')
        THEN 'User Management'
    WHEN action LIKE '%DATASET%' OR resource_type LIKE 'DATASET%' THEN 'Dataset'
    WHEN action = 'AGGREGATE_DATA' THEN 'Data Processing'
    WHEN action = 'GENERATE_FEATURES' THEN 'Feature Engineering'
    WHEN action = 'TRAIN_MODEL' THEN 'Model Training'
    WHEN action = 'RUN_FORECAST' THEN 'Forecast'
    ELSE 'System'
END
WHERE module = 'System';

UPDATE audit_logs
SET description = replace(action, '_', ' ')
WHERE description IS NULL;

UPDATE audit_logs
SET created_at = now()
WHERE created_at IS NULL;

ALTER TABLE audit_logs
    ALTER COLUMN id DROP DEFAULT,
    ALTER COLUMN action TYPE VARCHAR(100),
    ALTER COLUMN resource_id TYPE VARCHAR(255);

DO $$
BEGIN
    IF (
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'audit_logs'
          AND column_name = 'id'
    ) <> 'uuid' THEN
        ALTER TABLE audit_logs ALTER COLUMN id TYPE UUID USING gen_random_uuid();
    END IF;
END
$$;

ALTER TABLE audit_logs
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_audit_logs_status'
          AND conrelid = 'audit_logs'::regclass
    ) THEN
        ALTER TABLE audit_logs
            ADD CONSTRAINT ck_audit_logs_status CHECK (status IN ('SUCCESS', 'FAILED'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS ix_audit_logs_created_id
    ON audit_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_module_action ON audit_logs(module, action);

COMMIT;
