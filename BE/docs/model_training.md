# Model Training API

These endpoints are separate from the four legacy `/api/v1/experiments` endpoints.
They train real scikit-learn RandomForestRegressor models and persist configurations,
immutable splits and both result tables in PostgreSQL. They do not aggregate, generate
lags, regenerate targets, shuffle, purge, or split data again.

## Setup

1. Run `uv sync` in `BE`.
2. Apply the additive model-training and run-log migrations to the same PostgreSQL
   database used by the backend: from `BE`, run
   `uv run python -m scripts.apply_model_training_migration`.
3. Restart the backend and refresh Swagger.

## Lag Feature vehicle-count training

The separate `POST /api/model-training/lag-features` API now accepts a saved
Lag Feature `split_id`; it never partitions Feature Generation rows itself.
Create the split first with `POST /api/train-test-splits`, then submit:

```json
{
  "split_id": "SPLIT_UUID",
  "n_estimators": 100,
  "max_depth": 10
}
```

The API reads the persisted TRAIN and TEST memberships, fits and evaluates a
Random Forest independently for horizons +1, +3, and +5, and returns MAE/RMSE
per horizon. It rejects splits that fail the stored or rechecked leakage
boundary. The existing `/api/model-training/experiment` workflow remains
separate and unchanged.

Before using this flow, apply `migrations/20261121_lag_feature_generation.sql`
and `migrations/20261122_persistent_train_test_splits.sql` to PostgreSQL.

## First experiment

### Swagger Parameters

1. Call `POST /api/train-test-split/training` with the feature-engineering response.
   The backend saves the split and returns its UUID as `split_id`.
2. Open `POST /api/model-training/experiment` and click **Try it out**.
3. Enter `split_id` and choose the Random Forest parameters in their separate inputs.
   There is no JSON request body and no duplicate dataset_version_id input.
   The dataset and matrices are loaded from the saved split, without splitting again.

Example POST URL (no body):

```text
/api/model-training/experiment?split_id=YOUR_RETURNED_UUID&n_estimators=50&max_depth=5&evaluation_mode=exploratory
```
`max_depth=0` means unlimited depth. `max_features=1.0` means all features;
integer `1` means one feature. No database migration is needed for this input change.
Counts, warnings, client eligibility flags and legacy request metadata are ignored;
data dimensions, values, ordering, 70/30 counts and timestamps are validated again.
Supply chronological data: `lag_1` is the value at forecast origin and `lag_5` is
origin minus four minutes. Train/test origins must be timezone-aware and ordered.
Targets must correspond to origin +1, +3, +5 minutes. If optional history/target
timestamps are omitted, these fixed offsets are derived, never the feature values.
Conflicting values for the same time are rejected. Provenance remains the caller's
provided observations; these checks cannot independently verify the original source file.

The response includes `experiment_id`, `experiment_name` (`Ex-001`...), `split_id`,
configuration, measured fit/prediction/total durations, validity information,
`performance_by_horizon`, `prediction_rows`, dependency versions and creation time.
The POST is synchronous. PENDING, RUNNING, COMPLETED and FAILED states are persisted.
If fitting fails, the stored FAILED experiment is returned, with a safe error message.
An abrupt process termination can leave RUNNING records; there is no background job
recovery or retry endpoint in this version.
Each run also persists timestamped progress entries for access validation, split sizes,
per-horizon model fitting/evaluation and completion or failure. Admins can read the
combined legacy and Data Scientist run status and logs from
`GET /api/v1/admin/experiments/overview?limit=10`; each training-run item includes its
split ID, hyperparameters, evaluation mode and progress logs. The endpoint requires admin
authentication. Existing databases must apply `20261107_add_model_training_logs.sql`
before serving this response.

## Subsequent configurations, same data

Reuse the same `split_id` and change the hyperparameters to create another experiment.
If an older split response has no ID, call the split endpoint once again to save it.
Identical canonical payloads share a split ID, even under concurrent requests. PostgreSQL identity and unique constraints generate nonduplicated names; rolled-back inserts
may leave sequence gaps. Names belong to the new API's independent experiment table.

## Results and comparison

- `GET /api/model-training/experiments?skip=0&limit=20`: accessible experiments;
  optionally filter `dataset_version_id`.
- `GET /api/model-training/experiments/{experiment_id}`: persisted results.
- `POST /api/model-training/experiments/compare`: only completed
  experiments using the same version, canonical split, horizons, mode and evaluation
  policy and identical Test timestamps/actuals. Accepts experiment_ids in JSON; returns saved Random Forest metrics, configurations and the minimum RMSE per horizon, without selecting an overall model.

Creation requires Data Scientist/admin dataset access. Read access uses existing
dataset access checks. These APIs do not train a final future-forecast model or
persist fitted model binaries; they persist inputs/configuration/versions to rerun.

## Evaluation rules

One forest is fit per horizon, only using X_train and that horizon's y_train.
Persistence uses X_test[:, 0] (latest observed flow). Historical Average uses the
mean of y_train for each horizon, without test labels or artificial horizon bias.
All three models use exactly the same test rows. Detailed rows store forecast
origin, target time, actual/predicted flow, absolute and squared error. Summary MAE
is mean absolute error; RMSE is sqrt(mean squared error).

Official eligibility requires max(train target times) < min(test history start).
There is no minimum of 10 Test samples. Validated chronological 70/30 splits need at
least one training and one test sample. Leakage still prevents official evaluation:
official requests return 422 with a code/message; exploratory requests can run with
eligibility false. The Experiment response does not expose a warnings field.

New experiments use evaluation policy traffic-v2 without min-test=10. Existing
experiments retain their stored eligibility and policy for provenance; reading an
old result does not promote it to official. Stored warnings are omitted from the
response, with no database migration or data rewrite. All three models, three
horizons, timings, predictions and MAE/RMSE calculations remain unchanged.

## Verification

`uv run pytest tests/test_model_training.py tests/test_train_test_split.py tests/test_experiment_service.py`

`uv run ruff check .`

Opt-in PostgreSQL integration tests create and remove only a uniquely named test
schema. In PowerShell:

```powershell
$env:RUN_TRAINING_POSTGRES_TESTS = '1'
uv run pytest tests/test_model_training_postgres.py -q
Remove-Item Env:RUN_TRAINING_POSTGRES_TESTS
```

They verify migration replay, persisted reload, concurrent experiment naming,
split deduplication, reuse by ID and comparison. Use a development database account
with schema creation privileges.


## Three display tables

Every experiment response includes `result_tables`, derived from persisted predictions:

- `horizon_forecasts`: three Random Forest rows (+1/+3/+5) at the latest test forecast origin. `forecast_origin_time` is the time forecasting starts; `target_timestamp` is the time predicted and matched to actual flow. MSE/RMSE cover all Test rows at that horizon; `sample_count` describes that scope.
- `prediction_details`: all model/test/horizon combinations. Individual rows use `squared_error` and `absolute_error`, not aggregate MSE/RMSE.
- `model_summary`: three model rows. MAE/MSE/RMSE pool all test-origin/horizon pairs with equal weights. RMSE is the square root of pooled MSE, not the mean of horizon RMSEs.

For three Test origins, table sizes are 3, 27, and 3. Empty/failed runs have empty tables. Existing completed experiments also expose these tables on GET without retraining or database migration. Legacy `performance_by_horizon` and `prediction_rows` remain available. Swagger returns these as JSON; the frontend can render the three arrays as tables. No automatic best-model selection is performed.



## POST comparison example

Select 2–20 distinct, existing COMPLETED experiment UUIDs. Replace these illustrative
UUIDs with IDs from GET /api/model-training/experiments:

```json
{
  "experiment_ids": [
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005"
  ]
}
```

Example response shape (illustrative values only; the API reads saved DB metrics):

```json
{
  "experiments": [
    {
      "experiment_id": "00000000-0000-4000-8000-000000000004",
      "experiment_name": "Ex-004",
      "n_estimators": 100,
      "max_depth": 10,
      "min_samples_split": 2,
      "min_samples_leaf": 1,
      "max_features": 1.0,
      "bootstrap": true,
      "random_state": 42,
      "training_time_sec": 0.171,
      "prediction_time_sec": 0.012,
      "performance": {
        "1": {"mae": 28.52, "rmse": 36.23},
        "3": {"mae": 23.87, "rmse": 27.11},
        "5": {"mae": 38.98, "rmse": 50.41}
      }
    },
    {
      "experiment_id": "00000000-0000-4000-8000-000000000005",
      "experiment_name": "Ex-005",
      "n_estimators": 150,
      "max_depth": 12,
      "min_samples_split": 2,
      "min_samples_leaf": 1,
      "max_features": 1.0,
      "bootstrap": true,
      "random_state": 42,
      "training_time_sec": 0.251,
      "prediction_time_sec": 0.017,
      "performance": {
        "1": {"mae": 27.06, "rmse": 35.07},
        "3": {"mae": 23.58, "rmse": 26.82},
        "5": {"mae": 38.55, "rmse": 49.94}
      }
    }
  ],
  "best_by_horizon": {"1": "Ex-005", "3": "Ex-005", "5": "Ex-005"},
  "best_experiment_ids_by_horizon": {
    "1": "00000000-0000-4000-8000-000000000005",
    "3": "00000000-0000-4000-8000-000000000005",
    "5": "00000000-0000-4000-8000-000000000005"
  },
  "tied_experiment_ids_by_horizon": {
    "1": ["00000000-0000-4000-8000-000000000005"],
    "3": ["00000000-0000-4000-8000-000000000005"],
    "5": ["00000000-0000-4000-8000-000000000005"]
  }
}
```

Exact RMSE ties list all minimum-scoring IDs, sorted by UUID. The first is used
in best_by_horizon and best_experiment_ids_by_horizon so input order does not break ties.
No overall model is selected, trained, or persisted. Access checks apply to every
experiment. Missing IDs return 404, inaccessible datasets 403, non-completed runs
409, incompatible evaluation conditions/Test sets or incomplete metrics 422.
The former GET compare operation is removed; Training endpoints are unchanged.
