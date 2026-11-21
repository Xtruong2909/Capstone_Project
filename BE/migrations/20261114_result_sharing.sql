-- Result Sharing Management: shared_reports + shared_report_items
-- 2026-11-14

CREATE TABLE IF NOT EXISTS shared_reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(255)  NOT NULL,
    description     TEXT,
    created_by      UUID          NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    visibility      VARCHAR(32)   NOT NULL DEFAULT 'BUSINESS_USER',
    status          VARCHAR(16)   NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    CONSTRAINT ck_shared_report_status     CHECK (status     IN ('DRAFT', 'PUBLISHED', 'REVOKED')),
    CONSTRAINT ck_shared_report_visibility CHECK (visibility = 'BUSINESS_USER')
);

CREATE INDEX IF NOT EXISTS ix_shared_reports_created_by ON shared_reports(created_by);
CREATE INDEX IF NOT EXISTS ix_shared_reports_status     ON shared_reports(status);

CREATE TABLE IF NOT EXISTS shared_report_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id        UUID          NOT NULL REFERENCES shared_reports(id) ON DELETE CASCADE,
    resource_type   VARCHAR(32)   NOT NULL,
    resource_id     UUID          NOT NULL,
    resource_version_id UUID       REFERENCES dataset_versions(id) ON DELETE RESTRICT,
    visible_sections JSONB        NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_share_item_resource UNIQUE (share_id, resource_type, resource_id),
    CONSTRAINT ck_share_item_resource_type CHECK (
        resource_type IN ('DATASET', 'TRAIN_TEST', 'EXPERIMENT', 'PREDICTION')
    ),
    CONSTRAINT ck_share_item_sections_array CHECK (jsonb_typeof(visible_sections) = 'array')
);

CREATE INDEX IF NOT EXISTS ix_shared_report_items_share_id ON shared_report_items(share_id);

-- Also upgrade a database that applied an earlier draft of this migration.
ALTER TABLE shared_report_items
    ADD COLUMN IF NOT EXISTS resource_version_id UUID REFERENCES dataset_versions(id) ON DELETE RESTRICT;

ALTER TABLE shared_reports ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE shared_reports DROP CONSTRAINT IF EXISTS ck_shared_report_visibility;
ALTER TABLE shared_reports ADD CONSTRAINT ck_shared_report_visibility
    CHECK (visibility = 'BUSINESS_USER');
ALTER TABLE shared_report_items DROP CONSTRAINT IF EXISTS ck_share_item_sections_array;
ALTER TABLE shared_report_items ADD CONSTRAINT ck_share_item_sections_array
    CHECK (jsonb_typeof(visible_sections) = 'array');
