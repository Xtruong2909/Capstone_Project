-- One current data file per Dataset. Run after taking a database backup.
-- Analytical rows and experiment results retain their IDs and are relinked.
BEGIN;
SET LOCAL lock_timeout = '15s';

DO $migration$
DECLARE
    ref record;
    old_column text;
    new_column text;
BEGIN
    IF to_regclass('public.dataset_versions') IS NULL THEN
        RETURN;
    END IF;
    LOCK TABLE datasets, dataset_versions IN ACCESS EXCLUSIVE MODE;
    CREATE TEMP TABLE dataset_file_mapping ON COMMIT PRESERVE ROWS AS
    SELECT id AS old_id, dataset_id,
        first_value(id) OVER (PARTITION BY dataset_id ORDER BY created_at DESC, id DESC) AS file_id
    FROM dataset_versions;
    CREATE UNIQUE INDEX ON dataset_file_mapping(old_id);

    -- The latest confirmed mapping is the current mapping for that Dataset.
    DELETE FROM dataset_column_mappings WHERE id IN (
        SELECT id FROM (
            SELECT id, row_number() OVER (
                PARTITION BY dataset_id ORDER BY updated_at DESC, id DESC
            ) AS position FROM dataset_column_mappings
        ) ranked WHERE position > 1
    );

    CREATE TEMP TABLE current_file_sessions ON COMMIT DROP AS
    SELECT DISTINCT map.file_id, link.session_id
    FROM dataset_version_sessions link
    JOIN dataset_file_mapping map ON map.old_id = link.version_id;
    DELETE FROM dataset_version_sessions;
    INSERT INTO dataset_version_sessions(version_id, session_id)
    SELECT file_id, session_id FROM current_file_sessions;

    -- Keep old quality checks as history, with at most one active check.
    UPDATE data_quality_checks SET status = 'failed'
    WHERE id IN (
        SELECT id FROM (
            SELECT check_row.id, row_number() OVER (
                PARTITION BY map.dataset_id ORDER BY check_row.created_at DESC, check_row.id DESC
            ) AS position
            FROM data_quality_checks check_row
            JOIN dataset_file_mapping map ON map.old_id = check_row.dataset_version_id
            WHERE check_row.status IN ('queued', 'running')
        ) ranked WHERE position > 1
    );

    FOR ref IN
        SELECT child.relname AS table_name, attribute.attname AS column_name
        FROM pg_constraint constraint_row
        JOIN pg_class child ON child.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = child.relnamespace
        JOIN pg_attribute attribute ON attribute.attrelid = child.oid
            AND attribute.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
            AND constraint_row.confrelid = 'dataset_versions'::regclass
            AND namespace_row.nspname = 'public'
            AND child.relname <> 'dataset_version_sessions'
    LOOP
        EXECUTE format(
            'UPDATE %I child SET %I = map.file_id FROM dataset_file_mapping map '
            'WHERE child.%I = map.old_id AND map.old_id <> map.file_id',
            ref.table_name, ref.column_name, ref.column_name
        );
    END LOOP;

    DELETE FROM dataset_versions WHERE id IN (
        SELECT old_id FROM dataset_file_mapping WHERE old_id <> file_id
    );
    ALTER TABLE dataset_versions RENAME TO dataset_files;
    ALTER TABLE dataset_version_sessions RENAME TO dataset_file_sessions;
    ALTER TABLE dataset_files DROP COLUMN version_tag CASCADE;
    ALTER TABLE dataset_files DROP COLUMN version_number;
    ALTER TABLE dataset_files ADD CONSTRAINT uq_dataset_current_file UNIQUE(dataset_id);
    ALTER TABLE dataset_files ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE dataset_files SET updated_at = created_at;

    FOR ref IN
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name IN ('dataset_version_id', 'resource_version_id', 'version_id')
    LOOP
        old_column := ref.column_name;
        new_column := replace(old_column, 'version', 'file');
        EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', ref.table_name, old_column, new_column);
    END LOOP;

    FOR ref IN
        SELECT child.relname AS table_name, constraint_row.conname
        FROM pg_constraint constraint_row JOIN pg_class child ON child.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = child.relnamespace
        WHERE namespace_row.nspname = 'public' AND constraint_row.conname LIKE '%version%'
    LOOP
        EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I',
            ref.table_name, ref.conname, replace(ref.conname, 'version', 'file'));
    END LOOP;
END
$migration$;

-- Convert stored job/configuration payloads; audit events remain immutable.
CREATE OR REPLACE FUNCTION pg_temp.current_dataset_payload(value jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $payload$
DECLARE
    result jsonb;
    canonical_id uuid;
BEGIN
    IF jsonb_typeof(value) = 'object' THEN
        SELECT coalesce(jsonb_object_agg(
            CASE WHEN key = 'versions' THEN 'dataset_files'
                ELSE replace(key, 'version_id', 'file_id') END,
            pg_temp.current_dataset_payload(item)
        ), '{}'::jsonb) INTO result
        FROM jsonb_each(value) AS entries(key, item)
        WHERE key NOT IN ('version', 'version_tag', 'source_version_tag', 'version_number', 'new_version_tag');
        RETURN result;
    ELSIF jsonb_typeof(value) = 'array' THEN
        SELECT coalesce(jsonb_agg(pg_temp.current_dataset_payload(item) ORDER BY position), '[]'::jsonb)
        INTO result FROM jsonb_array_elements(value) WITH ORDINALITY entries(item, position);
        RETURN result;
    ELSIF jsonb_typeof(value) = 'string'
        AND (value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT file_id INTO canonical_id FROM dataset_file_mapping WHERE old_id = (value #>> '{}')::uuid;
        RETURN CASE WHEN canonical_id IS NOT NULL THEN to_jsonb(canonical_id::text) ELSE value END;
    END IF;
    RETURN value;
END
$payload$;

DO $payloads$
DECLARE ref record;
BEGIN
    IF to_regclass('pg_temp.dataset_file_mapping') IS NULL THEN RETURN; END IF;
    FOR ref IN SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'jsonb' AND table_name <> 'audit_logs'
    LOOP
        EXECUTE format('UPDATE %I SET %I = pg_temp.current_dataset_payload(%I) WHERE %I IS NOT NULL',
            ref.table_name, ref.column_name, ref.column_name, ref.column_name);
    END LOOP;
END
$payloads$;
COMMIT;
