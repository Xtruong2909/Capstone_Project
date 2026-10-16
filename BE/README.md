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

## Admin-created accounts

Set these variables in `BE/.env` to send temporary account credentials using Gmail SMTP:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-sender@gmail.com
SMTP_PASSWORD=your-16-character-google-app-password
SMTP_FROM_EMAIL=your-sender@gmail.com
```

Use a Google App Password, not the Gmail account password. Keep it private and do not commit
`BE/.env`. New accounts receive a generated temporary password by email and must call
`POST /api/v1/auth/change-password` after login before using regular authenticated endpoints.

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
