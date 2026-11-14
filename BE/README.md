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

For an existing database, apply the model-training migrations after updating the backend:

```powershell
Push-Location BE
uv run python -m scripts.apply_model_training_migration
Pop-Location
```

This includes the per-dataset experiment-name migration required by the experiment browser.
Before running it, apply the Lag Feature generation and Train/Test Split migrations,
because the experiment-batch migration references those tables.

## Administrator audit logs

The append-only audit history is exposed at `GET /api/v1/admin/audit-logs` and requires
an Administrator JWT. Existing PostgreSQL databases must apply
`migrations/20261107_complete_audit_logs.sql` once; it preserves existing events and
converts their IDs to UUID. For example, from the repository root:

```powershell
Get-Content -Raw 'BE\migrations\20261107_complete_audit_logs.sql' |
  docker compose exec -T postgres psql -U admin -d urban_traffic -v ON_ERROR_STOP=1
```

The endpoint returns `{ total, skip, limit, items }` and supports `user_id`, exact
`action`, exact `module`, exact `resource_id`, `status=SUCCESS|FAILED`, timezone-aware `start_date` and
`end_date`, and free-text `search`. Results are sorted newest first with UUID as the
stable tie-breaker. Authentication, user administration, dataset, feature-engineering,
train/test, model-training, traffic aggregation, and unhandled system errors are logged
by the backend where those operations exist. There are no API routes to create, edit,
or delete audit events. New split-scoped training runs record `RUN_EXPERIMENT` with
`module=Model Training` and `resource_id=experiment_id` after completion or failure.
Apply `migrations/20261127_backfill_experiment_audit_history.sql` to show older
saved experiments as `IMPORT_EXPERIMENT_HISTORY`; these entries carry
`details.historical_backfill=true` and the original timestamps, so they are not
mistaken for events captured when the original run occurred.

`GET /api/v1/admin/experiments/overview` includes the group, aggregation, feature
generation, and split IDs for recent training runs, Train/Test sample counts, and
saved metrics for all three methods and horizons. Its `limit` controls the number
of recent experiments returned.

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
For an existing database, also apply `migrations/20261102_remove_congestion_level.sql` to remove
the obsolete traffic classification column. Applying it permanently discards stored classification
labels; new databases initialized from `init_db.sql` do not create that column.

## Dataset upload (Data Engineer)

`POST /api/v1/datasets/upload` accepts `multipart/form-data` and requires a bearer token
for a user with the `data_engineer` role. Supported file extensions are `.csv`, `.json`,
`.xls`, `.xlsx`, and `.parquet`. Each upload creates a dataset and a `PENDING` dataset version.

Required form fields:

| Field           | Meaning                                 |
| --------------- | --------------------------------------- |
| `file`          | Dataset file                            |
| `name`          | Dataset name (3-128 characters)         |
| `source`        | Dataset source                          |
| `location_name` | Traffic capture location                |
| `description`   | Optional description                    |
| `capture_date`  | Optional collection date (`YYYY-MM-DD`) |

Dataset code is generated automatically and the initial version is set to `v1.0`.
Uploads are limited to 2 GiB by default; configure
`MAX_DATASET_UPLOAD_BYTES` to change the limit and `DATASET_UPLOAD_DIR` to change storage.
Docker Compose persists uploaded files in the `dataset_uploads` volume.
Dataset names must be unique. Reusing an existing name returns `409 Conflict`; choose a
different name before uploading.

Existing databases must apply `migrations/20261015_add_dataset_upload_file_metadata.sql`
before using this endpoint. New databases initialized from `init_db.sql` include the columns.

### Step 4: Normalize and export a Dataset group

Data Engineers only need the `group_id` from the upload response:

1. `POST /api/v1/datasets/groups/{group_id}/normalize` creates a background job that normalizes every Dataset and its Recording Sessions independently. No body is required.
2. `GET /api/v1/datasets/groups/{group_id}/processing-jobs/{job_id}` shows progress, counts, and errors per Dataset. The response has one top-level `staging_id` for the whole group; per-Dataset staging file IDs stay internal. Wait for `COMPLETED` before exporting.
3. `POST /api/v1/datasets/groups/{group_id}/export` creates a background job that exports the successful staging result of each Dataset as its own new version. No body is required. Poll the same job-status endpoint.

New group jobs return HTTP 202. A group job can finish with `COMPLETED`, `PARTIAL_SUCCESS`, or `FAILED`; a failed Dataset does not discard other successful results. Export requires all Datasets in the latest group normalization job to have completed successfully. The original CSV files remain unchanged.
Repeating Export after a completed run returns the existing completed job with HTTP 200. The staging files are consumed by the first successful Export; if they are missing without a completed export, the API returns HTTP 409 and asks for a new Normalize run.
The Export job carries the same group `staging_id` as its source Normalize job, while each operation has its own `job_id`.

### Step 5: Review and submit exported Dataset versions

All endpoints use the `group_id` from upload. The report, status, and submit actions use the versions created by the latest completed Export for that group, so versions from different Export runs are never mixed.

1. `GET /api/v1/datasets/groups/{group_id}/versions` lists versions across the group; optional `?status=PENDING|SUBMITTED|APPROVED|REJECTED` filters them.
2. `GET /api/v1/datasets/groups/{group_id}/report` returns one normalization report per exported Dataset, including source Sessions and group totals.
3. `GET /api/v1/datasets/groups/{group_id}/status` returns each exported version's approval status and a group status. `MIXED` means the versions differ in status.
4. `POST /api/v1/datasets/groups/{group_id}/submit` submits all pending exported versions to Admin in one transaction. Optional JSON body `{"comment":"Đã kiểm tra dữ liệu, nhờ Admin duyệt nhóm."}` saves the same comment on each submitted version; omitting the body uses a default comment. The request fails with 409 before any change if a version is rejected, lacks export history, or the group has changed since Export.
5. `POST /api/v1/datasets/groups/{group_id}/resubmit` submits only rejected exported versions again. No body is required; approved versions stay approved.

The earlier per-Dataset version routes remain callable for compatibility but are hidden from Swagger. Admin approval remains per Dataset version.

### Admin: Review and grant access by Dataset group

1. `GET /api/v1/admin/datasets/groups` lists groups with exported versions waiting for review.
2. `GET /api/v1/admin/datasets/groups/{group_id}/datasets` lists the Dataset versions from the latest completed group Export.
3. `GET /api/v1/admin/datasets/groups/{group_id}/datasets/{dataset_id}/sessions` lists the source Sessions; append `/{session_id}/preview` to inspect paginated CSV rows.
4. `POST /api/v1/admin/datasets/groups/{group_id}/review` accepts `{"status":"APPROVED"}` or `{"status":"REJECTED","note":"..."}` and updates only submitted versions together. An already reviewed version keeps its decision.
5. `GET /api/v1/admin/datasets/groups/catalog` lists all groups for access management. Use `/groups/{group_id}/eligible-users`, `POST /groups/{group_id}/access`, `GET /groups/{group_id}/access`, and `DELETE /groups/{group_id}/access/{user_id}` under `/api/v1/admin/datasets` to manage access across the group. Grant request body is `{"user_id":"..."}`.

Group access reuses the existing per-Dataset grants. Every current Dataset in the group needs an approved version before group grant; newly added Datasets can be included by granting the group again after approval. `GET /api/v1/datasets/accessible-groups` lists the groups visible to the signed-in user. Older per-Dataset Admin routes remain callable for compatibility but are hidden from Swagger.

### Dataset preview

`GET /api/v1/datasets/{dataset_id}/preview?page=1&page_size=20&representation=normalized`
returns a paginated preview from the latest uploaded version without modifying the original
file. It is available to authenticated Data Engineers, Admins, and Data Scientists
with a dataset access grant. `dataset_id` is the dataset UUID;
`page_size` must be between 1 and 100. CSV, JSON, XLS, XLSX, and Parquet files are supported.
For an exactly matching pNEUMA CSV header, the default `normalized` representation expands
trajectory points into one row per point and reports the total point count. Use
`representation=raw` to view source CSV records. Other dataset structures remain raw and
include a warning when no normalization rule applies. pNEUMA point offsets are cached in a
versioned sidecar index next to the immutable uploaded file so later pages do not rescan it.

### Dataset column mapping

These endpoints are available to authenticated Data Engineers. Read-only GET endpoints also allow
Admins and Data Scientists with a dataset access grant; PATCH remains restricted
to Data Engineers. They configure display/consumer
column names for the latest uploaded version; they do not transform or overwrite the source file.

| Method  | Endpoint                                        | Purpose                                                     |
| ------- | ----------------------------------------------- | ----------------------------------------------------------- |
| `GET`   | `/api/v1/datasets/groups/{group_id}/columns`         | List shared source headers for all Datasets and Sessions in the group |
| `PATCH` | `/api/v1/datasets/groups/{group_id}/column-mappings` | Save one shared mapping for the group                         |
| `GET`   | `/api/v1/datasets/groups/{group_id}/column-mappings` | Retrieve the shared mapping                                   |

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

### Dataset access management

Admin-managed dataset access is enforced at the dataset level. A user may view or use a dataset only
when the admin has created a `dataset_access_grants` row for the pair `(dataset_id, user_id)`, and the
user role is one of `data_scientist` or `business_user`.

| Method   | Endpoint                                               | Purpose                                                          |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `GET`    | `/api/v1/admin/datasets/{dataset_id}/eligible-users`   | List users eligible for grant, with `has_access` status          |
| `POST`   | `/api/v1/admin/datasets/{dataset_id}/access`           | Grant access to a single user for that dataset                   |
| `GET`    | `/api/v1/admin/datasets/{dataset_id}/access`           | List users already granted access to the dataset                 |
| `DELETE` | `/api/v1/admin/datasets/{dataset_id}/access/{user_id}` | Revoke access                                                    |
| `GET`    | `/api/v1/datasets/accessible`                          | List datasets visible to the current authenticated user          |
| `GET`    | `/api/v1/datasets/approved`                            | List approved datasets visible to Data Scientist |

The key rule is that dataset access is not global; it is scoped by dataset. This is why the admin APIs require
`dataset_id` in the path and then accept a single `user_id` in the request body when granting access.

Example grant request:

```json
{
  "user_id": "6d1d3a3a-1234-4321-9876-abcdef123456"
}
```

Data Scientists browse approved data by group, Dataset, then Recording Session:

1. `GET /api/v1/datasets/approved` lists groups containing at least one approved Dataset granted to the caller. It accepts optional `search` (group name/drone), `skip=0`, and `limit=50` (1–100).
2. `GET /api/v1/datasets/approved/groups/{group_id}/datasets` lists only approved Datasets in that group granted to the caller. Each item includes the selected approved `version_id`.
3. `GET /api/v1/datasets/approved/groups/{group_id}/datasets/{dataset_id}/sessions` lists the Sessions of that Dataset's latest approved version; `page` and `page_size` paginate the list.
4. `GET /api/v1/datasets/approved/groups/{group_id}/datasets/{dataset_id}/sessions/{session_id}/preview` returns paginated raw or normalized rows for one Session.

The group, Dataset, and Session IDs must match. These routes require a Dataset access grant and an approved version; Admins and Data Engineers receive `403 Forbidden`. Missing or invalid bearer tokens receive `401 Unauthorized`. The older version-ID Session routes remain callable for compatibility but are hidden from Swagger. The `/datasets/accessible` endpoint keeps its existing permissions.

### Data Scientist: Temporal aggregation

`POST /api/v1/ds/aggregations` accepts `{"group_id":"...","aggregation_interval":60}`; the interval defaults to 60 seconds. It selects every Dataset in the group and each Dataset's latest approved normalized version. The caller must have access to every Dataset. A single `aggregation_id` identifies the group run, while each Dataset and Recording Session is processed independently in the background.

Use `GET /api/v1/ds/aggregations/{aggregation_id}/results` for paginated results across the entire group; add `?session_id=...` to select one Session. `GET /api/v1/ds/aggregations/{aggregation_id}/combined-results` reads all saved Session time bins. Each result row includes `dataset_id` and `session_id`. Sessions and recording days stay separate; results are never recomputed from the source files.

Each minute's `vehicle_count` is `COUNT DISTINCT track_id` within its own Recording Session. The three Temporal Aggregation APIs return saved counts and timestamps only; they do not perform quality checks or create features.

### Data Scientist: Lag Features and vehicle-count prediction

`POST /api/lag-features/generate` accepts `{"aggregation_id":"..."}` for a completed 60-second aggregation. It saves sliding windows independently for each Session. `lag_1` is the count at the forecast origin, `lag_5` is four minutes earlier, and `target_h1`, `target_h3`, `target_h5` are observed counts one, three, and five minutes later. Missing or duplicated minutes break a window; outliers are kept. Repeating the same request returns the saved `feature_generation_id` and does not duplicate samples.

Use `GET /api/lag-features/{feature_generation_id}` for status, `/sessions` for each Session's sample count, `/preview?page=1&page_size=20` for saved rows, and `/summary` for horizon counts. The path parameter is the `feature_generation_id` returned by Generate, not a Dataset or Session ID. These endpoints read PostgreSQL. Feature Generation uses observed consecutive minutes without coverage flags. Five lags plus the +5 target require ten consecutive time bins, so a completed Session with fewer than ten bins appears in `/sessions` with `sample_count: 0`.

`POST /api/train-test-splits` creates a reusable Train/Test split from a COMPLETED `feature_generation_id`, grouped by recording day (`DAY_BASED`, default) or whole Session (`SESSION_BASED`). It returns a stable `split_id`; `GET /api/train-test-splits/{split_id}` returns the saved summary, and `/preview?subset=TRAIN|TEST&page=1&page_size=20` pages through the saved samples. The split API checks that Train targets do not overlap Test feature history and never trains a model. For repeatable experiments, submit the saved `split_id` and each configuration to `POST /api/model-training/experiments`; the backend manages experiment batches internally, assigns Ex-01, Ex-02, etc., and stores per-horizon metrics, predictions, and model metadata. The experiment comparison endpoint reports Test metrics but does not select a model. `POST /api/predictions` accepts `model_id`, `aggregation_id`, and `session_id`; it uses the chosen saved forest and the latest five consecutive counts from that Session, without refitting. The response contains forecast timestamps and predicted vehicle counts for horizons 1, 3, and 5; a per-horizon model ID returns that horizon.

Apply `migrations/20261121_lag_feature_generation.sql` and `migrations/20261122_persistent_train_test_splits.sql` before the model-training migration script. The script also applies `20261123_model_training_batches.sql`, which adds Batch support and preserves existing experiment history. These migrations create the feature/model/split tables, backfill `aggregation_id` for any feature rows saved by an earlier revision, and add the forest-to-split reference. The Docker backend stores fitted model artifacts in the `lag_feature_models` volume.

### Experiment Evaluation (RQ2/RQ3)

The six Model Training endpoints keep their existing paths. Completed split-scoped experiments save Test predictions for Random Forest, Persistence (`lag_1`), and Historical Average (the mean of each horizon's **Train** targets). The separate Swagger section **Thí nghiệm - Evaluation RQ2/RQ3** provides three read-only tables:

1. `GET /api/model-training/experiments/{experiment_id}/evaluation/horizon-results` lists Random Forest Test forecasts with input, forecast, and actual timestamps, actual/predicted vehicle counts, absolute and squared error, plus MAE/MSE/RMSE for each horizon. It supports `horizon`, `session_id`, `page`, and `page_size`.
2. `GET /api/model-training/experiments/{experiment_id}/evaluation/comparison` lists all three methods; filter by `model`, `horizon`, and `session_id` and paginate with `page` and `page_size`.
3. `GET /api/model-training/experiments/{experiment_id}/evaluation/summary` returns nine aggregate metric sets and six signed Random Forest minus baseline MAE/RMSE differences. Negative differences mean Random Forest has lower error. The response includes the Historical Average method and saved Train target means.

All API timestamps are UTC. `display_timezone: "Europe/Athens"` tells Frontend which timezone to use for local display. These endpoints read persisted Test results and do not retrain or change the saved split. Apply `migrations/20261125_model_training_evaluation_results.sql` and `migrations/20261126_backfill_saved_experiment_baselines.sql` to existing PostgreSQL databases after the earlier Model Training migrations. The backfill computes baseline results for previously completed split-scoped experiments without fitting Random Forest again.

### Data Quality Validation

The former pre-normalization Data Quality Check API and normalization validation endpoint are removed.
Internal Data Quality history remains available to the AI assistant.

Admins can review a specific version's file contents with
`GET /api/v1/admin/datasets/{dataset_id}/versions/{id}/preview?page=1&page_size=20&representation=normalized`.
It returns the same paginated preview shape as the Data Engineer preview endpoint and applies that
version's saved column mappings. The route is restricted to administrators.

## Quản lý quyền truy cập Dataset

### Cập nhật: chỉ cấp quyền toàn dataset, không có thời hạn

Theo yêu cầu mới, đã bỏ hai cột `dataset_version_id` và `expires_at` khỏi bảng
`dataset_access_grants`. Bảng còn `id`, `dataset_id` (NOT NULL), `user_id`,
`granted_by`, `created_at`; giữ unique `(dataset_id, user_id)` và index user.

- Database đã áp dụng migration mở rộng: chạy tiếp
  [migration bỏ cột](migrations/20261026_remove_legacy_dataset_access_columns.sql).
- Migration khóa bảng và từ chối chạy nếu còn quyền phiên bản hoặc có thời hạn,
  tránh mất dữ liệu hay tự mở rộng quyền. Không xóa bản ghi quyền.
- Schema khởi tạo mới trong [init_db.sql](init_db.sql) đã được cập nhật;
  database mới dùng schema này không chạy lại hai migration access lịch sử.
  Không chạy init_db.sql trên database đang dùng.
- Đã xóa cả ba API cũ: GET/POST `/admin/access-grants` và
  DELETE `/admin/access-grants/{grant_id}`. Các đường dẫn này trả 404 và không
  còn trong Swagger. Đã bỏ schema/CRUD riêng chỉ phục vụ các API cũ.
- Frontend chưa chỉnh sửa: form cấp quyền phiên bản cũ cần chuyển sang API mới.

### 1. Kết quả kiểm tra kiến trúc

- FastAPI dùng prefix `/api/v1`, SQLAlchemy sync `Session`, PostgreSQL/PostGIS.
- JWT và RBAC được tái sử dụng từ [core/deps.py](app/core/deps.py); không thay đổi token, đăng nhập hoặc danh sách role.
- Code thực tế có thêm `data_engineer`, ngoài `admin`, `data_scientist`, `business_user`. Giữ nguyên quyền và nghiệp vụ upload, mapping, validation, normalization, export, submit/resubmit của role này.
- Tái sử dụng model `DatasetAccessGrant` và bảng `dataset_access_grants`, hiện chỉ cấp quyền toàn dataset. Không tạo bảng trùng chức năng; ba API `/admin/access-grants` cũ đã bị xóa.
- Có dependency Alembic trong project nhưng không thấy cấu hình/env/revision Alembic. Các migration hiện tại là SQL trong [migrations/](migrations/), nên tính năng này tiếp tục dùng SQL migration.
- Hai migration cấp quyền đã được áp dụng trên PostgreSQL local trong quá trình triển khai; môi trường khác cần kiểm tra schema trước khi áp dụng.

### 2. File tạo mới

| File                                                                                                                         | Trách nhiệm                                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [app/schemas/dataset_access.py](app/schemas/dataset_access.py)                                                               | Validate UUID, từ chối field dư, DTO không có mật khẩu                     |
| [app/crud/crud_dataset_access.py](app/crud/crud_dataset_access.py)                                                           | Truy vấn và thay đổi bản ghi; lọc dataset bằng EXISTS trước phân trang     |
| [app/services/dataset_access_service.py](app/services/dataset_access_service.py)                                             | Cấp/thu hồi, validation nghiệp vụ, transaction và xử lý xung đột           |
| [app/core/dataset_access.py](app/core/dataset_access.py)                                                                     | Dependency đọc dataset và dependency riêng cho scientist/analysis/training |
| [app/api/v1/endpoints/dataset_access.py](app/api/v1/endpoints/dataset_access.py)                                             | Năm API mới                                                                |
| [migrations/20261026_dataset_access_management.sql](migrations/20261026_dataset_access_management.sql)                       | Migration bổ sung, không xóa dữ liệu                                       |
| [tests/test_dataset_access.py](tests/test_dataset_access.py)                                                                 | Test service, HTTP ASGI, router thật và SQLAlchemy/SQLite                  |
| [migrations/20261026_remove_legacy_dataset_access_columns.sql](migrations/20261026_remove_legacy_dataset_access_columns.sql) | Bỏ cột phiên bản/thời hạn sau khi kiểm tra dữ liệu                         |

### 3. File chỉnh sửa

- [app/models/dataset.py](app/models/dataset.py): mở rộng model cấp quyền hiện có.
- [app/api/v1/api.py](app/api/v1/api.py): đăng ký router mới.
- [app/api/v1/endpoints/datasets.py](app/api/v1/endpoints/datasets.py): kiểm tra quyền các thao tác đọc.
- [app/api/v1/endpoints/dataset_mapping.py](app/api/v1/endpoints/dataset_mapping.py): kiểm tra quyền đọc columns/mappings.
- [app/api/v1/endpoints/data_quality.py](app/api/v1/endpoints/data_quality.py): kiểm tra quyền đọc kết quả quality check.
- [app/api/v1/endpoints/admin.py](app/api/v1/endpoints/admin.py), [app/crud/crud_admin.py](app/crud/crud_admin.py), [app/schemas/admin.py](app/schemas/admin.py): bỏ router, CRUD và schema chỉ dùng cho ba API cấp quyền cũ.
- [init_db.sql](init_db.sql): schema cấp quyền toàn dataset cho database mới.

Không chỉnh sửa Frontend, JWT, role, dữ liệu hoặc thuật toán validation/preprocessing.

### 4. Database và tương thích

Bảng `dataset_access_grants` hiện có:

| Cột          | Ý nghĩa                                                         |
| ------------ | --------------------------------------------------------------- |
| `id`         | UUID, khóa chính                                                |
| `dataset_id` | UUID NOT NULL, khóa ngoại tới dataset                           |
| `user_id`    | UUID NOT NULL, khóa ngoại tới người được cấp quyền              |
| `granted_by` | UUID người cấp quyền; có thể NULL nếu tài khoản admin đã bị xóa |
| `created_at` | Thời điểm cấp quyền; API trả tên `granted_at`                   |

Unique `(dataset_id, user_id)` ngăn cấp trùng kể cả khi request cạnh tranh.
Index `user_id` và unique index hỗ trợ truy vấn quyền. Quyền tồn tại đến khi
Admin thu hồi, không còn thời hạn hoặc scope theo phiên bản.

Chọn migration theo schema thực tế, không chạy lại migration đã áp dụng:

1. Database cũ chỉ có quyền phiên bản: áp dụng
   [migration mở rộng](migrations/20261026_dataset_access_management.sql).
2. Database đã mở rộng nhưng còn hai cột cũ: áp dụng
   [migration bỏ cột](migrations/20261026_remove_legacy_dataset_access_columns.sql).
   Script từ chối chạy nếu còn grant phiên bản hoặc có thời hạn; cần quyết định
   chuyển đổi quyền trước, không tự mở rộng quyền hay xóa bản ghi.
3. Database mới khởi tạo bằng [init_db.sql](init_db.sql) hiện tại đã có schema
   cuối cùng; không chạy lại hai migration trên.

Ví dụ từ thư mục BE, với kết nối PostgreSQL đã cấu hình và chỉ khi bước tương ứng
chưa được áp dụng:

```powershell
psql -v ON_ERROR_STOP=1 -f migrations/20261026_dataset_access_management.sql
psql -v ON_ERROR_STOP=1 -f migrations/20261026_remove_legacy_dataset_access_columns.sql
```

Trên PostgreSQL local đã áp dụng cả hai migration, xác nhận bỏ đúng hai cột và
giữ nguyên 2 bản ghi quyền tại thời điểm kiểm tra. Không chạy lại
[init_db.sql](init_db.sql) trên database hiện có vì script có lệnh DROP TABLE.

Ba API cũ GET/POST `/admin/access-grants` và DELETE
`/admin/access-grants/{grant_id}` đã bị xóa, trả 404. Frontend chưa thay đổi:
các màn hình còn gọi API cũ cần chuyển sang API mới bên dưới.

### 5. API và ví dụ

Prefix thực tế của tất cả đường dẫn dưới đây: `/api/v1`.

Header: `Authorization: Bearer <access_token>`.

Các UUID sau chỉ là ví dụ tài liệu, cần thay bằng ID thật lấy từ API/database.

#### GET /admin/datasets/{dataset_id}/eligible-users

Chỉ admin. Không có request body. Tham số `search` (tên/email), `skip=0`, `limit=50` (1–100).

```http
GET /api/v1/admin/datasets/11111111-1111-4111-8111-111111111111/eligible-users?search=example&skip=0&limit=50
```

Response `200`:

```json
[
  {
    "user_id": "22222222-2222-4222-8222-222222222222",
    "full_name": "Nguyen An",
    "email": "an@example.test",
    "role": "data_scientist",
    "has_access": false
  }
]
```

#### POST /admin/datasets/{dataset_id}/access

Chỉ admin. Không nhận role hoặc ID người cấp từ client.

**Phê duyệt trước, cấp quyền sau:** dataset phải có ít nhất một phiên bản có
`approval_status = APPROVED` mới được cấp quyền cho Data Scientist hoặc Business User.
Không có phiên bản, hoặc chỉ có `PENDING`, `SUBMITTED`, `REJECTED`: trả `409 Conflict`
và không tạo quyền. Một phiên bản đã duyệt vẫn đủ điều kiện dù có phiên bản mới đang chờ duyệt.
Quy tắc này áp dụng khi tạo quyền mới; không tự xóa hay thay đổi quyền đã cấp trước đó.

```http
POST /api/v1/admin/datasets/11111111-1111-4111-8111-111111111111/access
Content-Type: application/json
```

```json
{ "user_id": "22222222-2222-4222-8222-222222222222" }
```

Response `201`:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "dataset_id": "11111111-1111-4111-8111-111111111111",
  "user_id": "22222222-2222-4222-8222-222222222222",
  "full_name": "Nguyen An",
  "email": "an@example.test",
  "role": "data_scientist",
  "granted_by": "44444444-4444-4444-8444-444444444444",
  "granted_at": "2026-10-26T04:00:00Z"
}
```

Lỗi: 401 JWT thiếu/không hợp lệ; 403 không phải admin; 404 dataset/user không tồn tại; 409 cấp trùng; 422 UUID/body/role đích không hợp lệ. Unique violation do request cạnh tranh được rollback và chuyển thành 409 khi grant đã tồn tại.

#### GET /admin/datasets/{dataset_id}/access

Chỉ admin. Không có request body; `skip`, `limit` giống trên.

```http
GET /api/v1/admin/datasets/11111111-1111-4111-8111-111111111111/access?skip=0&limit=50
```

Response `200`: mảng các object có đầy đủ các field như response POST, ví dụ:

```json
[
  {
    "id": "33333333-3333-4333-8333-333333333333",
    "dataset_id": "11111111-1111-4111-8111-111111111111",
    "user_id": "22222222-2222-4222-8222-222222222222",
    "full_name": "Nguyen An",
    "email": "an@example.test",
    "role": "data_scientist",
    "granted_by": "44444444-4444-4444-8444-444444444444",
    "granted_at": "2026-10-26T04:00:00Z"
  }
]
```

Chưa cấp cho ai: `[]`.

#### DELETE /admin/datasets/{dataset_id}/access/{user_id}

Chỉ admin. Không có request body.

```http
DELETE /api/v1/admin/datasets/11111111-1111-4111-8111-111111111111/access/22222222-2222-4222-8222-222222222222
```

Response `204 No Content`, không có JSON body. Dataset/grant không tồn tại: `404`. Không xóa user, dataset hoặc grant dataset khác. Request đọc tiếp theo của user bị thu hồi nhận 403.

#### GET /datasets/accessible

Admin nhận toàn bộ dataset; scientist/business chỉ nhận dataset được cấp. Danh tính lấy từ JWT. `user_id` không phải tham số API; nếu gửi thêm query này thì không có tác dụng đổi danh tính.

Không có request body. Hỗ trợ `search` theo tên/code, `skip`, `limit`.

```http
GET /api/v1/datasets/accessible?search=Traffic&skip=0&limit=50
```

Response `200`:

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Traffic UAV",
    "code": "TRAFFIC-UAV",
    "source": "UAV",
    "description": null,
    "capture_date": null,
    "location_name": "Test location",
    "created_at": "2026-10-26T03:00:00Z"
  }
]
```

Chưa được cấp: `[]`. Không trả đường dẫn file trên server. Role `data_engineer` tiếp tục dùng các API engineering hiện có; API consumer này trả 403 cho role đó.

### 6. Swagger

1. Áp dụng migration trên môi trường mong muốn, chạy backend theo hướng dẫn dự án.
2. Mở `/docs` trên host backend.
3. Gọi `POST /api/v1/auth/login` bằng tài khoản thật; nếu bắt buộc đổi mật khẩu thì hoàn tất luồng đó trước.
4. Bấm **Authorize**, nhập JWT `access_token` vào ô HTTPBearer.
5. Với admin: gọi eligible-users → POST access → GET access.
6. Đăng nhập scientist/business, thay token trong Authorize; kiểm tra accessible và preview dataset được cấp.
7. Gọi preview dataset khác: 403. Gửi token consumer vào API quản trị: 403.
8. Đổi lại token admin, DELETE access; đổi token consumer và đọc lại dataset: 403, accessible không còn dataset vừa thu hồi.

### 7. API hiện có đã bổ sung kiểm tra quyền

Các GET sau cho phép admin, data engineer hiện có, và consumer có grant:

| Đường dẫn sau `/api/v1/datasets`                 | Bảo vệ                                               |
| ------------------------------------------------ | ---------------------------------------------------- |
| `/{dataset_id}/preview`                          | Chặn trước khi đọc dữ liệu file                      |
| `/{dataset_id}/columns`                          | Chặn metadata cột                                    |
| `/{dataset_id}/column-mappings`                  | Chặn mapping                                         |
| `/{dataset_id}/versions`                         | Chặn danh sách phiên bản của dataset                 |
| `/{dataset_id}/versions/{version_id}/status`     | Grant dataset + xác nhận version thuộc dataset       |
| `/{dataset_id}/versions/{version_id}/report`     | Grant dataset + truy vấn cặp dataset/version hiện có |

`GET /datasets/versions` toàn hệ thống vẫn chỉ dành cho data engineer như cũ. Các API admin toàn hệ thống giữ dependency admin. Consumer không thể dùng những API này để liệt kê dữ liệu chưa được cấp.

Dependency `require_dataset_scientist` kết hợp role admin/scientist và dataset grant, dành cho API analysis/training trong tương lai. Helper `check_dataset_version_access` phân giải version về dataset gốc. Không dùng quyền đọc dataset làm quyền thực hiện mọi thao tác.

### 8. Kiểm thử và giới hạn xác minh

- Lần chạy toàn bộ gần nhất: **287 tests passed** sau khi bỏ hai cột. Sau khi xóa ba API cũ, chạy lại bộ test phân quyền: **40 tests passed**.
- Lint tất cả file Python tạo/chỉnh sửa: **pass**. `git diff --check`: **pass**.
- Bộ test phân quyền: cấp quyền hai role; nhiều user/dataset; duplicate; role guards; thu hồi; 403; danh sách theo JWT; missing/invalid token; UUID/body validation; xác nhận bỏ hai cột và ba API cũ; cạnh tranh unique mô phỏng; kiểm tra 9 router đọc thật; cấm business preprocessing; sai parent version; query SQLAlchemy và unique constraint trên SQLite tạm.
- 247 test cũ pass trước khi bổ sung test mới.
- Concurrency được kiểm tra qua mô phỏng IntegrityError và unique constraint thực trong SQLite; chưa chạy hai transaction đồng thời trên PostgreSQL.
- SQLite test không kiểm chứng PostGIS. Trên PostgreSQL local đã kiểm tra migration, truy vấn quyền và response; kiểm thử tạo quyền trước khi bỏ cột dùng transaction rollback, không lưu quyền thử nghiệm.
- Môi trường Windows mặc định gặp lỗi có sẵn `csv.field_size_limit` với giá trị 2 GiB lớn hơn C long. Chạy test với biến môi trường process-only, không sửa cấu hình file/thuật toán:

```powershell
$env:MAX_DATASET_UPLOAD_BYTES = '2147483647'
uv run pytest -q
uv run ruff check .
```

Trong phiên thực thi dùng Python của `.venv` hiện có (`.venv/Scripts/python.exe -m pytest`) thay vì cài dependency mới.

Lint toàn repo còn các lỗi có sẵn ở [crud_dataset.py](app/crud/crud_dataset.py), [crud_user.py](app/crud/crud_user.py), [user.py](app/models/user.py) (import order), và [dataset_normalization_service.py](app/services/dataset_normalization_service.py) (S110/S112). Không sửa logic normalization ngoài phạm vi.

### 9. Những phần chưa có trong backend hiện tại

Chưa thấy HTTP API riêng cho Dataset Detail, Download, Analysis, Traffic Aggregation, Traffic Visualization, Heatmap, Forecasting hay Model Training. Có schema SQL liên quan traffic/forecast và model experiment, nhưng không có router nghiệp vụ tương ứng để tích hợp. Không tạo API giả hoặc viết lại những tính năng này.

Vì vậy test Business User không được training hiện xác minh dependency dành cho training, không phải một API training đang tồn tại. Khi triển khai các router mới, phải sử dụng dependency phù hợp và phân giải mọi ID file/version/experiment về dataset gốc trước khi trả dữ liệu. Quyền dataset-wide áp dụng cho toàn bộ phiên bản hiện tại và tương lai của dataset đó; không tự bổ sung bộ lọc approval ngoài nghiệp vụ đã có.


### Data Scientist xem trước dữ liệu đã duyệt

Trong nhóm Swagger **Data Scientist Dataset Access**:

1. Đăng nhập Data Scientist và Authorize bằng access token.
2. Gọi `GET /api/v1/datasets/approved`, lấy `dataset_id` và `version_id`.
3. Gọi `GET /api/v1/datasets/{dataset_id}/versions/{version_id}/preview?page=1&page_size=20`.

Không có body. `page >= 1`, `page_size` từ 1–100 (mặc định 20).
`representation` nhận `normalized` (mặc định) hoặc `raw`.
Response gồm metadata, `dataset_version_id`, `columns`, `rows`, `warnings` và
`pagination` (page, page_size, returned_rows, has_more, total_rows).
Áp dụng mapping của đúng phiên bản đã chọn, không tự lấy bản mới nhất.

Chỉ Data Scientist có grant dataset và phiên bản được chọn là `APPROVED` mới được xem.
Admin/DE, chưa có quyền hoặc phiên bản chưa duyệt: `403`. Thiếu/sai token: `401`.
Dataset/version không tồn tại, sai dataset cha hoặc thiếu file: `404`.
Định dạng không hỗ trợ: `415`; tham số sai hoặc lỗi đọc dữ liệu: `422`.
API chỉ đọc, không sửa file và không trả đường dẫn lưu trữ server.

### Chia sẻ kết quả cho Business User

Business User xem dữ liệu nghiên cứu qua API `/api/shared-results`. Các API nội bộ đọc Dataset,
Train/Test Split và Experiment không trả dữ liệu cho role này. Data Scientist công bố từng
resource và bật từng section qua `/api/shares`; việc thu hồi có hiệu lực ở request kế tiếp.
Xem [hướng dẫn Result Sharing](docs/result_sharing.md) để biết migration, payload và phân trang.
