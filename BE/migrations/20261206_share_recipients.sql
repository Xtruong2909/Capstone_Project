BEGIN;
-- Backfill once: existing shares retain their current active Business Users.
-- Replaying this migration must never grant old shares to newly created users.
DO $$
BEGIN
    IF to_regclass('public.shared_report_recipients') IS NULL THEN
        CREATE TABLE shared_report_recipients (
            share_id UUID NOT NULL REFERENCES shared_reports(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (share_id, user_id)
        );
        INSERT INTO shared_report_recipients (share_id, user_id)
        SELECT r.id, u.id FROM shared_reports r CROSS JOIN users u
        WHERE u.role_id = 'business_user' AND u.is_active IS TRUE;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_shared_report_recipients_user_id ON shared_report_recipients(user_id);
COMMIT;
