# ⚡ Capstone Urban Traffic - Backend API

FastAPI backend service for Urban Traffic Pattern Analysis and Short-Term Congestion Forecasting.

For complete project documentation, architecture diagrams, and quick-start instructions, please refer to the [Root README](../README.md).

## Local Development
```powershell
# Start PostGIS Database
docker compose up -d

# Run FastAPI Development Server
uv run uvicorn app.main:app --reload --port 8000
```
API Documentation: `http://localhost:8000/docs`

## Outgoing email

Set these variables in `BE/.env` to send OTPs and temporary account credentials using Gmail SMTP:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-sender@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM_EMAIL=your-sender@gmail.com
```

Use a Google App Password, not the Gmail account password. Keep it private and do not commit
`BE/.env`. Restart the backend after changing these settings. Forgot-password OTPs are emailed
and expire after five minutes. New accounts receive a generated temporary password by email and must call
`POST /api/v1/auth/change-password` after login before using regular authenticated endpoints.
Signed-in users can change their password with one request to
`POST /api/v1/auth/profile/change-password`, providing `current_password`, `new_password`, and
`confirm_new_password`. Forgot-password OTP endpoints remain separate and do not require the old password.

For an existing database, apply the migration in `migrations/20261014_add_must_change_password.sql`.

## Dataset upload (Data Engineer)

`POST /api/v1/datasets/upload` accepts `multipart/form-data` and requires a bearer token
for a user with the `data_engineer` role. Supported file extensions are `.csv`, `.json`,
`.xls`, `.xlsx`, and `.parquet`. Each upload creates a dataset and a `PENDING` dataset version.

Required form fields:

| Field | Meaning |
| --- | --- |
| `file` | Dataset file |
| `name` | Dataset name (3-128 characters) |
| `source` | Dataset source |
| `location_name` | Traffic capture location |
| `description` | Optional description |
| `capture_date` | Optional collection date (`YYYY-MM-DD`) |

Dataset code is generated automatically and the initial version is set to `v1.0`.
Uploads are limited to 1 GiB by default; configure
`MAX_DATASET_UPLOAD_BYTES` to change the limit and `DATASET_UPLOAD_DIR` to change storage.
Docker Compose persists uploaded files in the `dataset_uploads` volume.
Dataset names must be unique. Reusing an existing name returns `409 Conflict`; choose a
different name before uploading.

Existing databases must apply `migrations/20261015_add_dataset_upload_file_metadata.sql`
before using this endpoint. New databases initialized from `init_db.sql` include the columns.

### Dataset preview

`GET /api/v1/datasets/{dataset_id}/preview?page=1&page_size=20&representation=normalized`
returns a paginated preview from the latest uploaded version without modifying the original
file. It is available to authenticated Data Engineers. `dataset_id` is the dataset UUID;
`page_size` must be between 1 and 100. CSV, JSON, XLS, XLSX, and Parquet files are supported.
For an exactly matching pNEUMA CSV header, the default `normalized` representation expands
trajectory points into one row per point and reports the total point count. Use
`representation=raw` to view source CSV records. Other dataset structures remain raw and
include a warning when no normalization rule applies. pNEUMA point offsets are cached in a
versioned sidecar index next to the immutable uploaded file so later pages do not rescan it.

### Dataset column mapping

These endpoints are available to authenticated Data Engineers. They configure display/consumer
column names for the latest uploaded version; they do not transform or overwrite the source file.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/datasets/{dataset_id}/columns` | List source headers, inferred types, and saved target names |
| `PATCH` | `/api/v1/datasets/{dataset_id}/column-mappings` | Create, update, or remove custom column-name mappings |
| `GET` | `/api/v1/datasets/{dataset_id}/column-mappings` | Retrieve saved mappings for the latest version |

Mappings are arbitrary display names rather than fixed model fields. The request uses a `mappings`
array of `{ "source_column": "...", "target_column": "..." }` items. Source names must exist in
the dataset, and target names must be unique, non-empty identifiers containing letters, digits,
and underscores (starting with a letter). Use `target_column: null` to remove the mapping for a
source. PATCH merges the supplied entries with existing mappings. All mappings are stored against
the exact dataset version, and a later upload starts with no mapping until configured.

`GET /columns` reads only a bounded preview to infer types; it does not load the whole dataset.
The existing dataset preview endpoint applies saved names to column metadata and row keys while
keeping cell values, pNEUMA trajectory structure, and the original uploaded file unchanged.
The system retains the source names in the mapping configuration for traceability.

Apply `migrations/20261019_add_dataset_column_mappings.sql` and
`migrations/20261019_dataset_mapping_per_version.sql` to existing databases before using
these endpoints. New databases initialized from `init_db.sql` include the per-version mapping table.

Example PATCH request:

```json
{
  "mappings": [
    { "source_column": "track_id", "target_column": "vehicle_id" },
    { "source_column": "time", "target_column": "timestamp" },
    { "source_column": "type", "target_column": "vehicle_type" },
    { "source_column": "speed", "target_column": "vehicle_speed" }
  ]
}
```

Example response:

```json
{
  "dataset_id": "f337f852-18f1-47a1-8cb7-783fb6d8c4f1",
  "dataset_version_id": "7861e12f-c975-4cc1-bfa3-48913cfca973",
  "mappings": [
    { "source_column": "track_id", "target_column": "vehicle_id" },
    { "source_column": "time", "target_column": "timestamp" },
    { "source_column": "type", "target_column": "vehicle_type" },
    { "source_column": "speed", "target_column": "vehicle_speed" }
  ]
}
```

In Swagger UI at `http://localhost:8000/docs`, authorize with a Data Engineer bearer token, call
`GET /api/v1/datasets/{dataset_id}/columns`, then send the PATCH body and verify it with
`GET /api/v1/datasets/{dataset_id}/column-mappings` or the dataset preview endpoint.

### Data Quality Check

Authenticated Data Engineers can run a complete quality scan on the latest uploaded dataset
version. The source is opened read-only. CSV records are scanned incrementally; Parquet is read
in record batches, JSON record arrays are streamed, and XLSX is read in read-only mode. A
disk-backed temporary SQLite index tracks full-row duplicates and affected row numbers so those
sets are not held in application memory. The database stores the run state, report, and individual
issues; issue values are clipped and API issue details are paginated.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/datasets/{dataset_id}/quality-checks` | Queue a scan for the latest dataset version |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}` | Poll status and progress |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}/report` | Read the completed aggregate report |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}/issues?page=1&page_size=50` | Read paginated issue details; optional `issue_type` filter |

Start a scan in Swagger UI. The response is `202 Accepted`:

```json
{
  "check_id": "28b1796b-3e4c-4d39-a42f-34ba5d687e73",
  "dataset_id": "f337f852-18f1-47a1-8cb7-783fb6d8c4f1",
  "dataset_version_id": "7861e12f-c975-4cc1-bfa3-48913cfca973",
  "status": "queued",
  "progress_percent": 0,
  "processed_rows": 0,
  "total_rows": null,
  "message": "Đã xếp hàng kiểm tra chất lượng dataset"
}
```

Poll the status route until `status` is `completed` or `failed`. Then fetch the report:

```json
{
  "check_id": "28b1796b-3e4c-4d39-a42f-34ba5d687e73",
  "dataset_id": "f337f852-18f1-47a1-8cb7-783fb6d8c4f1",
  "dataset_version_id": "7861e12f-c975-4cc1-bfa3-48913cfca973",
  "status": "completed",
  "detected_structure": "tabular_csv",
  "total_rows": 1000,
  "valid_rows": 980,
  "invalid_rows": 20,
  "total_errors": 25,
  "errors_by_type": {
    "missing_value": { "total_errors": 10, "affected_rows": 8 },
    "duplicate_record": { "total_errors": 5, "affected_rows": 5 },
    "invalid_timestamp": { "total_errors": 3, "affected_rows": 3 },
    "invalid_coordinate": { "total_errors": 4, "affected_rows": 4 },
    "invalid_format": { "total_errors": 3, "affected_rows": 3 }
  },
  "errors_by_column": [],
  "missing_values_by_column": [],
  "missing_required_columns": [],
  "generated_at": "2026-10-19T08:00:00Z"
}
```

`total_errors` counts individual findings, while `invalid_rows` counts distinct data rows with at
least one finding; therefore a row with multiple errors contributes once to `invalid_rows`.
Required trajectory fields are detected using source names and saved column mappings. Supported
aliases include `track_id`/`vehicle_id` and `timestamp`/`time`/`timestamp_ms`. pNEUMA's exact wide
trajectory header is recognized and checked as one source row per vehicle track, including each
repeated point group; relative `time` values are checked as finite, non-negative seconds, and no
reshape or data cleanup is performed. Latitude/longitude fields are checked against WGS84 bounds.

`409 Conflict` means the latest version already has a queued/running quality scan. A report is
available only after completion (`409` while queued/running; `409` if the check failed, with the
failure message available from the status endpoint). The current job runner uses FastAPI
`BackgroundTasks` and persists progress in PostgreSQL; queued/running work is not automatically
resumed after an application process restart. Production deployments that require durable
retries should dispatch these persisted job IDs through a dedicated worker queue.

For an existing database, apply `migrations/20261019_add_data_quality_checks.sql`. New databases
initialized from `init_db.sql` create the run and issue tables. The scan does not alter, remove,
or write back to the uploaded dataset file.
