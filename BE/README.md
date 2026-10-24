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
Uploads are limited to 2 GiB by default; configure
`MAX_DATASET_UPLOAD_BYTES` to change the limit and `DATASET_UPLOAD_DIR` to change storage.
Docker Compose persists uploaded files in the `dataset_uploads` volume.
Dataset names must be unique. Reusing an existing name returns `409 Conflict`; choose a
different name before uploading.

Existing databases must apply `migrations/20261015_add_dataset_upload_file_metadata.sql`
before using this endpoint. New databases initialized from `init_db.sql` include the columns.

### Normalize and validate a dataset

`POST /api/v1/datasets/{dataset_id}/normalize?page=1&page_size=20` runs Step 4.1. It applies the
saved column mappings, creates a normalized staging file, and returns a paginated preview.
The request body is not needed.

`POST /api/v1/datasets/{dataset_id}/normalize/validate` runs Step 4.2 against the latest
normalized staging file for that dataset. It returns a completed summary with row counts and
counts for missing values, duplicate records, out-of-range coordinates, and negative speeds.
`invalid_rows` counts distinct rows with at least one issue; issue counts can overlap. Latitude
and longitude are checked against WGS84 bounds. This validation does not modify the staging file.

Example response:

```json
{
  "dataset_id": "3cfdf4c5-d7bf-4958-9a14-0cb6bcb02a11",
  "validation_status": "completed",
  "total_rows": 2165658,
  "valid_rows": 2165558,
  "invalid_rows": 100,
  "validation_results": {
    "missing_values": 40,
    "duplicate_records": 30,
    "invalid_coordinates": 20,
    "negative_speed": 10
  }
}
```

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

pNEUMA's fixed schema is validated directly without preloading a sample of whole trajectories.
Issue details are inserted in bounded batches of 1,000 through the CRUD layer, and each affected
row/type is indexed only once per source row. All individual findings are retained, including
multiple findings in the same trajectory; batching does not truncate the report or issue list.

Progress is persisted approximately every two seconds of validation, or every 5,000 completed
source rows, whichever occurs first. Long pNEUMA rows also check the timer every 1,024 points.
`processed_rows` counts completed source rows, not trajectory points. For formats with known row
counts, progress uses that total; otherwise the percentage is an estimate until completion.
Blocking file/database I/O can delay an update. Swagger does not poll automatically: execute the
status GET again to see the latest persisted progress.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/datasets/{dataset_id}/quality-checks` | Queue a scan for the latest dataset version |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}` | Poll status and progress |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}/report` | Read the completed aggregate report |
| `GET` | `/api/v1/datasets/{dataset_id}/quality-checks/{check_id}/issues?page=1&page_size=50` | Read paginated issue details; optional `issue_type` filter |

Admins can review a specific version's file contents with
`GET /api/v1/admin/datasets/{dataset_id}/versions/{id}/preview?page=1&page_size=20&representation=normalized`.
It returns the same paginated preview shape as the Data Engineer preview endpoint and applies that
version's saved column mappings. The route is restricted to administrators.

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

`total_errors` counts individual errors, while `invalid_rows` counts distinct data rows with at
least one error; therefore a row with multiple errors contributes once to `invalid_rows`.
Outlier warnings are counted separately and do not invalidate a row.
Required trajectory fields are detected using source names and saved column mappings. Supported
aliases include `track_id`/`vehicle_id` and `timestamp`/`time`/`timestamp_ms`. pNEUMA's exact wide
trajectory header is recognized and checked as one source row per vehicle track, including each
repeated point group; relative `time` values are checked as finite, non-negative seconds, and no
reshape or data cleanup is performed. Latitude/longitude fields are checked against WGS84 bounds.

#### Rule-based outlier warnings

The same `POST /api/v1/datasets/{dataset_id}/quality-checks` accepts an **optional** JSON body
with an `outlier_rules` array. Omitting the body, sending `{}`, or sending `{"outlier_rules": []}`
keeps outlier detection disabled. There are **no default production thresholds**: the operator
must supply bounds supported by the dataset, a research reference, or an approved domain rule.
The service validates configuration syntax, not the scientific validity of the supplied basis.
Swagger's request example is `{"outlier_rules": []}` so executing the example does not accidentally
flag every positive speed against a generated `[0, 0]` range.

##### Cách dùng `outlier_rules: []` trong Swagger

Nếu chưa có ngưỡng outlier được xác định và có cơ sở, giữ nguyên body sau rồi bấm **Execute**:

```json
{
  "outlier_rules": []
}
```

Danh sách trống nghĩa là **không chạy Outlier Detection trong lần kiểm tra này**, không phải
tắt toàn bộ Data Quality Validation. Các kiểm tra sau vẫn chạy:

- **Missing Value:** phát hiện giá trị thiếu.
- **Duplicate:** phát hiện bản ghi trùng hoàn toàn.
- **Timestamp Validation:** kiểm tra định dạng và miền giá trị thời gian.
- **Coordinate Validation:** kiểm tra tọa độ hợp lệ.
- **Negative Speed Validation:** phát hiện `speed < 0` và `avg_speed < 0`.
- **Format/Schema Validation:** kiểm tra cấu trúc và kiểu dữ liệu theo logic hiện có.

Muốn phát hiện tốc độ quá cao hoặc gia tốc bất thường, thêm rule cho trường cần kiểm tra vào
`outlier_rules`, kèm ngưỡng, đơn vị và `basis` (cơ sở lựa chọn ngưỡng) như bảng bên dưới.
Cấu hình áp dụng cho lần kiểm tra được tạo bởi request đó. Không dùng nguyên mẫu
`min_value: 0, max_value: 0` để kiểm tra tốc độ: khoảng `[0, 0]` sẽ cảnh báo mọi tốc độ dương.

Outlier được ghi là **warning**, không tự tăng `invalid_rows`. Hệ thống chỉ ghi nhận và báo cáo,
không tự sửa hoặc xóa dữ liệu gốc. Khi `outlier_rules` trống, các trường thống kê warning bằng
0 hoặc rỗng; điều này có nghĩa là chưa chạy kiểm tra outlier, không chứng minh dữ liệu không có outlier.

Each rule has the following fields:

| Field | Requirement |
| --- | --- |
| `field` | One of `speed`, `avg_speed`, `lon_acc`, `lat_acc`; at most one rule per field |
| `min_value` | Optional finite numeric lower bound |
| `max_value` | Optional finite numeric upper bound |
| `unit` | `km/h` for speed fields; `m/s^2` for acceleration fields |
| `basis` | Required non-empty explanation/reference supporting these bounds (up to 1000 characters) |

At least one bound is required; if both are supplied, `min_value <= max_value`. Bounds are
inclusive: only a value strictly below the minimum or above the maximum is an outlier. Speed
bounds must be non-negative. Acceleration bounds can be signed and asymmetric. Malformed rules,
duplicate fields, non-finite bounds, or incompatible units return HTTP 422 before a job is queued.

The [official pNEUMA data documentation](https://open-traffic.epfl.ch/index.php/downloads/)
confirms that original `speed` and `avg_speed` are in **km/h**, while `lon_acc` and `lat_acc` are
in **m/s²**. The existing structural normalization preserves these values and units. For other
tabular/normalized inputs, the caller must verify that the values use the units declared in the
rules. This check neither infers units from numeric magnitudes nor converts or changes data.
The source confirms units, not universal outlier thresholds.

Rules apply to canonical source names (case-insensitive) and saved mappings to these four fields.
An explicitly mapped supported field takes precedence over the source name. Unconfigured fields
are skipped. pNEUMA checks the track's `avg_speed` once and each point's `speed`, `lon_acc`, and
`lat_acc`; normalized files are checked per stored record using the existing format readers.
Missing, non-numeric, boolean, and non-finite values are not outlier warnings. Existing validation
still handles invalid values. Negative speeds remain `negative_speed` **errors**, without an
additional outlier warning; negative acceleration is permitted unless outside the configured range.

The completed `/report` includes:

- `outlier_rules`: exact configured bounds, units, and basis for this run; an empty array means
  outlier detection was disabled.
- `total_warnings` and `warning_rows`: individual warnings and distinct rows containing warnings.
- `warnings_by_type.outlier`: `total_warnings` and `affected_rows`, present when warnings exist.
- `warnings_by_column`: counts keyed by the original column name.

Warnings do not contribute to `errors_by_type`, `errors_by_column`, `total_errors`, or `invalid_rows`.
A row with warnings only remains in `valid_rows`; a row with an actual error still counts once in
`invalid_rows`. Multiple outlier points in one pNEUMA trajectory count as separate warnings but
one warning row. Warning and error row counts can overlap.

The existing paginated `/issues` includes both severities. Outliers have `issue_type: "outlier"`
and `severity: "warning"`; existing issue types have `severity: "error"`. Each issue retains its
source row number, source column name, observed value, and a message describing the bounds and
unit. Severity is derived from the stored issue type, so existing issue rows require no database
migration. Older reports remain readable with empty/zero warning fields. No source file is edited.

`409 Conflict` means the latest version already has a queued/running quality scan. A report is
available only after completion (`409` while queued/running; `409` if the check failed, with the
failure message available from the status endpoint). The current job runner uses FastAPI
`BackgroundTasks` and persists progress in PostgreSQL; queued/running work is not automatically
resumed after an application process restart. Production deployments that require durable
retries should dispatch these persisted job IDs through a dedicated worker queue.

For an existing database, apply `migrations/20261019_add_data_quality_checks.sql`. New databases
initialized from `init_db.sql` create the run and issue tables. The scan does not alter, remove,
or write back to the uploaded dataset file.

Submitting an exported version to admin does not require a separate
`POST /api/v1/datasets/{dataset_id}/quality-checks` run. The version must still have export /
normalization history before it can be submitted. The normalized staging validation endpoint
(`/api/v1/datasets/{dataset_id}/normalize/validate`) can be used separately to inspect the output.
