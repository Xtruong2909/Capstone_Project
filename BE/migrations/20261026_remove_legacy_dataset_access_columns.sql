-- Chạy sau 20261026_dataset_access_management.sql.
-- Chỉ bỏ cột khi không có quyền phiên bản hoặc quyền có thời hạn cần chuyển đổi.
BEGIN;
LOCK TABLE dataset_access_grants IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM dataset_access_grants
        WHERE dataset_version_id IS NOT NULL OR expires_at IS NOT NULL OR dataset_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Còn quyền phiên bản hoặc có thời hạn: cần xử lý rõ phạm vi trước khi bỏ cột';
    END IF;
END $$;
ALTER TABLE dataset_access_grants
    DROP CONSTRAINT ck_dataset_access_scope,
    DROP CONSTRAINT uq_user_dataset_grant,
    ALTER COLUMN dataset_id SET NOT NULL,
    DROP COLUMN dataset_version_id,
    DROP COLUMN expires_at;
COMMIT;
