# Model Training and Experiments

## Database setup

Apply the Lag Feature schema migrations `20261121_lag_feature_generation.sql`
and `20261122_persistent_train_test_splits.sql` first. Then, from `BE`, run:

```powershell
uv run python -m scripts.apply_model_training_migration
```

The migration runner applies the experiment schema, including the legacy
Batch-storage migration needed to preserve existing records, followed by
`20261124_model_training_baseline_evaluation.sql`. Batch management is not part
of the public API or current experiment workflow.

## Create an experiment

Create a completed Train/Test Split first using `POST /api/train-test-splits`.
Then submit its ID to `POST /api/model-training/experiments`; the backend
assigns an `Ex-01`, `Ex-02`, etc. name per split.

```json
{
  "split_id": "SAVED_SPLIT_UUID",
  "model": "RANDOM_FOREST",
  "forecast_horizons": [1, 3, 5],
  "hyperparameters": {
    "n_estimators": 100,
    "max_depth": 10,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "max_features": 1.0,
    "bootstrap": true,
    "random_state": 42
  }
}
```

Experiment numbers are reserved transactionally per split. Failed experiments
retain their number, and deleting an experiment does not reuse its name.
Concurrent requests for the same split receive distinct names.

The backend reads the saved TRAIN and TEST memberships, validates the leakage
check and stored counts, and uses `lag_1` through `lag_5` as features. It fits
one Random Forest per horizon on TRAIN only. It also evaluates two baselines on
the same TEST rows:

- **Persistence:** prediction equals the sample's `lag_1`.
- **Historical Average:** for each horizon, prediction equals the mean of that
  horizon's TRAIN targets. TEST targets are not used to calculate the mean.

MAE and RMSE are persisted for all nine method/horizon combinations.
Random Forest model artifacts are retained; baselines do not create trained
model artifacts. The split and features are not regenerated, and Test results
are not used to tune hyperparameters or select a deployment model.

## Read and compare results

The module exposes six endpoints:

1. `POST /api/model-training/experiments`
2. `GET /api/model-training/experiments`
3. `GET /api/model-training/experiments/{experiment_id}`
4. `GET /api/model-training/experiments/{experiment_id}/predictions`
5. `GET /api/model-training/experiments/{experiment_id}/models`
6. `POST /api/model-training/experiments/compare`

The predictions endpoint supports `model_type`, `horizon`, and `session_id`
filters and returns actual/predicted values, timestamps, and absolute errors.
Comparison requires completed experiments using the same split, horizons,
evaluation rules, and identical Test rows. It reports method metrics and the
MAE/RMSE differences between Random Forest and each baseline.
Experiments created before baseline evaluation was added retain their original
results; they are not backfilled with synthetic data and cannot be compared
against all three methods. Create a new experiment to obtain the complete
baseline metrics.

The legacy `POST /api/model-training/experiment` and
`POST /api/model-training/lag-features` routes are not exposed.

## Verification

From `BE`:

```powershell
uv run pytest tests/test_model_training_experiment_service.py tests/test_model_training.py tests/test_lag_feature_model_service.py
uv run ruff check .
```

PostgreSQL integration tests are opt-in and use a temporary schema:

```powershell
$env:RUN_TRAINING_POSTGRES_TESTS = '1'
uv run pytest tests/test_model_training_postgres.py -q
Remove-Item Env:RUN_TRAINING_POSTGRES_TESTS
```
