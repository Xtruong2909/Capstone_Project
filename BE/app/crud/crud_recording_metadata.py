"""Recover filenames through verified normalization lineage, never by latest upload."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

# UNION (not UNION ALL) also terminates cycles in malformed historical lineage.
_FILENAME_CANDIDATES = """
WITH RECURSIVE scoped_datasets AS (
    SELECT id, code FROM datasets
    WHERE CAST(:dataset_id AS uuid) IS NULL OR id = CAST(:dataset_id AS uuid)
), names(dataset_id, version_id, filename) AS (
    SELECT v.dataset_id, v.id::text, v.original_filename
    FROM dataset_versions v JOIN scoped_datasets d ON d.id = v.dataset_id
    WHERE NULLIF(BTRIM(v.original_filename), '') IS NOT NULL
    UNION
    SELECT d.id, a.resource_id, a.details->>'original_filename'
    FROM audit_logs a JOIN scoped_datasets d ON a.details->>'dataset_code' = d.code
    WHERE a.action = 'UPLOAD_DATASET' AND a.resource_type = 'DATASET_VERSION'
      AND NULLIF(BTRIM(a.details->>'original_filename'), '') IS NOT NULL
    UNION
    SELECT v.dataset_id, v.id::text, n.filename
    FROM names n
    JOIN data_cleaning_histories h ON h.parameters->>'source_version_id' = n.version_id
    JOIN dataset_versions v ON v.id = h.dataset_version_id AND v.dataset_id = n.dataset_id
)
SELECT v.id, MIN(n.filename) AS filename
FROM dataset_versions v JOIN names n ON n.version_id = v.id::text AND n.dataset_id = v.dataset_id
WHERE NULLIF(BTRIM(v.original_filename), '') IS NULL
GROUP BY v.id HAVING COUNT(DISTINCT n.filename) = 1
"""


def recoverable_original_filenames(
    db: Session, dataset_id: UUID | None = None,
) -> dict[UUID, str]:
    """Only return missing names supported by one unambiguous source filename."""
    rows = db.execute(text(_FILENAME_CANDIDATES), {"dataset_id": dataset_id})
    return {row.id: row.filename for row in rows}


def resolve_original_filename(
    db: Session, *, dataset_id: UUID, version_id: UUID, original_filename: str | None,
) -> str | None:
    if original_filename and original_filename.strip():
        return original_filename
    return recoverable_original_filenames(db, dataset_id).get(version_id)


def restore_original_filenames(db: Session) -> dict[UUID, str]:
    """Backfill missing metadata only; caller controls the transaction."""
    candidates = recoverable_original_filenames(db)
    restored: dict[UUID, str] = {}
    for version_id, filename in candidates.items():
        result = db.execute(
            text("""
                UPDATE dataset_versions SET original_filename = :filename
                WHERE id = :version_id AND NULLIF(BTRIM(original_filename), '') IS NULL
                RETURNING id
            """),
            {"filename": filename, "version_id": version_id},
        )
        if result.scalar_one_or_none() is not None:
            restored[version_id] = filename
    return restored
