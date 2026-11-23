BEGIN;
CREATE TABLE IF NOT EXISTS browser_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_fingerprint VARCHAR(64) NOT NULL,
    remember_me BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_browser_sessions_user_id ON browser_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_browser_sessions_expires_at ON browser_sessions(expires_at);
COMMIT;
