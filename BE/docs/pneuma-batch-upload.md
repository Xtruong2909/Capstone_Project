# pNEUMA batch upload

Apply [`20261111_pneuma_recording_sessions.sql`](../migrations/20261111_pneuma_recording_sessions.sql) to an existing PostgreSQL database before starting this backend. A fresh database created from [`init_db.sql`](../init_db.sql) already has these tables and columns.

`POST /api/v1/datasets/upload` accepts `multipart/form-data` and requires the existing Data Engineer bearer token. Swagger shows one `files` input: add one or more CSVs there. The `source`, `location_name`, `description`, and `capture_date` fields are optional. Dataset name is derived from each filename as `YYYYMMDD-dX` and is not entered in Swagger. If omitted, source defaults to `pNEUMA` and location to `Athens, Greece`. A supplied `capture_date` must match the date in every corresponding filename; leave it blank when uploading files from multiple days. Supplied metadata must match an existing Dataset when adding sessions. Existing clients can still send a single `file` field with `name`, `source`, and `location_name` for the old behavior and flat response; the legacy fields are hidden from Swagger. A single `file` without metadata also uses automatic pNEUMA upload.

```sh
curl -X POST 'http://localhost:8000/api/v1/datasets/upload' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'source=pNEUMA' \
  -F 'location_name=Athens, Greece' \
  -F 'description=Morning recordings' \
  -F 'capture_date=2018-10-24' \
  -F 'files=@20181024_d1_0830_0900.csv' \
  -F 'files=@20181024_d1_0900_0930.csv' \
  -F 'files=@20181024_d2_0830_0900.csv'
```

Example response (IDs are illustrative):

```json
{
  "total_files": 3,
  "uploaded_count": 3,
  "duplicate_count": 0,
  "failed_count": 0,
  "datasets": [
    {"name": "20181024-d1", "dataset_id": "f50c1d5b-b61f-4261-a37c-786621e4bc9e", "version_id": "ea58ebdc-267a-4182-adf7-8db320c12fa7", "session_count": 2},
    {"name": "20181024-d2", "dataset_id": "cdf6ce28-1830-42dd-ad98-e834151cb895", "version_id": "b27ad72a-902f-4b83-9c77-520e5bb4afee", "session_count": 1}
  ],
  "files": [
    {"original_filename": "20181024_d1_0830_0900.csv", "dataset_name": "20181024-d1", "status": "UPLOADED", "session_id": "460a797f-5d1d-4fb9-81de-5fbfbfe9664c", "error_message": null},
    {"original_filename": "20181024_d1_0900_0930.csv", "dataset_name": "20181024-d1", "status": "UPLOADED", "session_id": "4977ca6d-38db-4ad1-8d98-e895269e9281", "error_message": null},
    {"original_filename": "20181024_d2_0830_0900.csv", "dataset_name": "20181024-d2", "status": "UPLOADED", "session_id": "4a0eeb60-e907-4323-8fd4-de345aa63c99", "error_message": null}
  ]
}
```

`DUPLICATE` means a matching SHA-256 already exists in that Dataset; it returns the existing `session_id`. `CONFLICT` means the original filename exists with different bytes. `ERROR` indicates an invalid name, contradictory metadata, empty or oversized file, or a storage failure. Other files in the request continue. Each Dataset receives one new pending version for the newly uploaded recordings. The new version links all existing sessions without copying their files. Source files remain separate under `uploads/datasets/<dataset-name>/`.

`MAX_DATASET_UPLOAD_BYTES` (default 2.5 GiB), `MAX_DATASET_UPLOAD_BATCH_BYTES` (default 10 GiB), and `ASYNC_DATASET_UPLOAD_THRESHOLD_BYTES` (default 512 MiB) are environment settings. Uploads above the configured batch budget are rejected. Batches at or above the asynchronous threshold are staged first, then return HTTP 202 with `job_id`, `status`, `total_files`, and `processed_files`. Poll `GET /api/v1/datasets/upload/jobs/{job_id}` as the same Data Engineer to retrieve progress and the final grouped response. Background work runs in the API process; it needs a separate durable queue to resume automatically after process restarts.

Multipart data is spooled to disk by Starlette, then copied and hashed in bounded chunks. For a single-session version, the legacy `dataset_versions.data_file_path` still points to that CSV. For a version containing multiple sessions it is null, because a single path would silently omit recordings. The full set is in `dataset_version_sessions`, and the response includes `processing_warning`. Existing downstream processing is unchanged and does not automatically combine all sessions in a version.

## Dataset Preview & Review

Use the same bearer token as upload. Data Engineers can review uploaded pNEUMA datasets; other authenticated readers need the existing Dataset access grant. Swagger describes these endpoints and their response schemas:

1. `GET /api/v1/datasets?page=1&page_size=20` lists each `YYYYMMDD-dX` Dataset once, with its latest version, approval status, and session count. Optional `search` filters by Dataset name.
2. `GET /api/v1/datasets/{dataset_id}` returns the latest version and Dataset metadata.
3. `GET /api/v1/datasets/{dataset_id}/versions/{version_id}/sessions?page=1&page_size=20` lists the sessions linked to that exact version, including sessions carried forward from earlier versions.
4. `GET /api/v1/datasets/{dataset_id}/versions/{version_id}/sessions/{session_id}` returns one session's filename, size, scheduled times, checksum, upload status, and currently available validation information.
5. `GET /api/v1/datasets/{dataset_id}/versions/{version_id}/sessions/{session_id}/preview?page=1&limit=20` shows the selected pNEUMA session as a 10-column trajectory table by default (`representation=normalized`). This is a view computed from the stored CSV, not a new Parquet file. The response includes typed numeric values and the total number of trajectory points. Use `representation=raw` to preview original CSV rows without transformation; raw preview does not count the whole file, so `total_rows` is null. `limit` is 1–100. For wider raw pNEUMA rows, use `column_offset=512`, `1024`, etc. to view additional columns, up to 512 at once.

Example preview response (IDs abbreviated here only for readability):

```json
{
  "session_id": "...", "dataset_id": "...", "version_id": "...",
  "dataset_version_id": "...", "dataset_name": "20181024-d1",
  "original_filename": "20181024_d1_0830_0900.csv",
  "file_format": "csv", "file_size": 96, "status": "UPLOADED",
  "detected_structure": "pneuma_trajectory", "representation": "normalized",
  "columns": [{"name": "track_id", "type": "integer"}, {"name": "type", "type": "string"}, {"name": "traveled_d", "type": "float"}, {"name": "avg_speed", "type": "float"}, {"name": "lat", "type": "float"}, {"name": "lon", "type": "float"}, {"name": "speed", "type": "float"}, {"name": "lon_acc", "type": "float"}, {"name": "lat_acc", "type": "float"}, {"name": "time", "type": "float"}],
  "total_columns": 10, "column_offset": 0, "has_more_columns": false,
  "rows": [{"track_id": 1, "type": "Bus", "traveled_d": 17.84, "avg_speed": 17.835195, "lat": 37.977149, "lon": 23.737802, "speed": 21.6886, "lon_acc": 0.0571, "lat_acc": 0.306, "time": 0}],
  "rows_read": 1,
  "pagination": {"page": 1, "page_size": 20, "returned_rows": 1, "has_more": false, "total_rows": 1},
  "warnings": []
}
```

Missing files return 404; unreadable, malformed, or non-pNEUMA CSV requested as normalized returns 422; unsupported session format returns 415. Recording-session validation results and verified actual duration are not yet stored by the current schema, so those fields are null with an explanatory message. Preview does not run traffic aggregation or create a normalized dataset version.
