# Lag Feature Engineering

Scope: prepare observed X/Y only. No training, split, evaluation, model storage,
prediction execution, database writes or new tables.

## API

Both endpoints require the existing Bearer authentication, admin/data_scientist
role and dataset access grant (admin follows existing bypass rules).

- `POST /api/feature-engineering/training`
- `POST /api/feature-engineering/prediction`

These paths are mounted explicitly under `/api`, as requested, rather than the
existing `/api/v1` prefix. Both accept the same request:

```json
{
  "dataset_version_id": "88606239-73b3-401f-96c7-7eaeea164d99"
}
```

The optional `roi_identifier` is hidden from the request schema in Swagger and
defaults to `MAIN_ROI`. Existing clients may still send an explicit ROI;
validation and response ROI fields remain unchanged.

Configuration is fixed and returned under `configuration`:

```json
{
  "target_column": "traffic_flow",
  "aggregation_interval": 60,
  "lag_count": 5,
  "forecast_horizons": [1, 3, 5],
  "method": "sliding_window"
}
```

Unknown request fields are rejected. This includes attempts to change lag count
or horizon configuration. UUIDs in examples must be replaced with real IDs.

## Training

Returns `dataset_version_id`, `roi_identifier`, `configuration`,
`feature_order`, `target_order`, `sample_count`, `samples`.
For 15 uninterrupted valid observations there are 6 complete samples.
Example item in `samples` (times in UTC):

```json
{
  "dataset_version_id": "88606239-73b3-401f-96c7-7eaeea164d99",
  "roi_identifier": "MAIN_ROI",
  "recording_session_id": "88606239-73b3-401f-96c7-7eaeea164d99",
  "history_start_time": "2018-10-24T10:00:00Z",
  "time_bucket": "2018-10-24T10:04:00Z",
  "features": {"lag_1":190,"lag_2":197,"lag_3":203,"lag_4":175,"lag_5":189},
  "x": [190,197,203,175,189],
  "targets": {"target_h1":192,"target_h3":170,"target_h5":178},
  "y": [192,170,178],
  "target_times": {
    "target_h1":"2018-10-24T10:05:00Z",
    "target_h3":"2018-10-24T10:07:00Z",
    "target_h5":"2018-10-24T10:09:00Z"
  }
}
```

`x` always follows `[lag_1, lag_2, lag_3, lag_4, lag_5]`, newest first.
`y` follows `[target_h1, target_h3, target_h5]`.
All ten minutes from t-4 through t+5 must be observed, including intermediate
minutes that are not target horizons. No partial-Y samples are returned.
Future split code must use target timestamps (not only `time_bucket`) to keep
training labels before its boundary. This API does not perform that split.

## Prediction

Example response fields, in addition to version/ROI/session/configuration:

```json
{
  "feature_order": ["lag_1","lag_2","lag_3","lag_4","lag_5"],
  "history_start_time": "2018-10-24T10:10:00Z",
  "latest_time_bucket": "2018-10-24T10:14:00Z",
  "features": {"lag_1":197,"lag_2":195,"lag_3":208,"lag_4":195,"lag_5":172},
  "x": [197,195,208,195,172],
  "forecast_horizons": [1,3,5],
  "target_times": ["2018-10-24T10:15:00Z","2018-10-24T10:17:00Z","2018-10-24T10:19:00Z"]
}
```

The repository fetches only the latest five rows for that version/ROI/60-second
interval, without filtering null flows. It never falls back to an older valid
window if the latest observations are incomplete. There is no Y or forecast value.

## Integrity and session boundaries

- Existing `TrafficTimeSeries` model and `traffic_time_query` are reused.
- Filename recovery and relative-to-absolute timestamp conversion are reused;
  output timestamps are timezone-aware UTC. Without recording metadata, epoch
  offsets remain epoch offsets: this feature does not invent a capture date.
- Missing minutes and null/NaN/infinite/negative flows break windows; zero is
  accepted only when actually stored. No interpolation or zero imputation.
- Duplicate timestamps within a scope are rejected, not silently deduplicated.
- Pure builders accept `TrafficObservation` objects and partition by version,
  ROI and explicit `recording_session_id`. Prediction rejects mixed scopes.
- Current database has no row-level session field. Its ingestion represents a
  single source recording per dataset version, so the adapter uses version ID
  as session ID and never combines versions. If multiple recordings are merged
  into one version, their explicit session provenance must be persisted upstream
  before using this API; adjacent sessions cannot be inferred from time alone.

Training with insufficient history/future returns HTTP 200 with zero samples.
Prediction with insufficient/invalid latest history returns HTTP 422 with
`detail`. Missing version: 404; unauthenticated: 401; access denied: 403.

## Verification

From BE:

```text
uv run pytest tests/test_feature_engineering.py -q
uv run ruff check .
```

Tests cover example values, horizons, order, minute-by-minute sliding, gaps,
session/version/ROI isolation, invalid values, short series, duplicate buckets,
service/router orchestration and OpenAPI. Database access is mocked; these are
not live PostgreSQL or HTTP-server integration tests.
