# Future traffic-flow prediction

`POST /api/model-training/predict` selects a completed Random Forest Experiment
for a dataset and saved split, then predicts +1, +3 and +5 minutes. It does not
fit or re-fit any estimator. Supply either `dataset_version_id` (and `split_id`
when that version has several splits) or an existing `experiment_id` to identify
the dataset and split. The supplied Experiment ID is an anchor, not a forced
selection.

```json
{
  "dataset_version_id": "8c92096d-27b2-44b5-b150-2adc46fe7d92",
  "split_id": "58cbd837-8f2f-4e52-a940-85156f1635c3"
}
```

The selector considers completed candidates with scores from a **separate
Validation set**. Candidates without Validation scores are skipped. Each
`model_validation_results` row stores the same
Validation-set fingerprint and sample count, plus `performance_by_horizon`:

```json
{
  "1": {"mae": 12.5, "rmse": 16.2},
  "3": {"mae": 14.1, "rmse": 18.3},
  "5": {"mae": 15.0, "rmse": 19.4}
}
```

The candidate with the lowest mean MAE over the three horizons wins; mean RMSE
breaks ties, then Experiment number. Candidates must share the dataset, split,
Validation fingerprint, sample count and evaluation policy. Existing Experiment
metrics are measured on **Test**, so they are never silently substituted for
Validation. The current Experiment training workflow does not produce a
Validation set or a Final Model. Until an upstream process stores genuine
Validation scores, the API returns `409 VALIDATION_NOT_AVAILABLE`.

The chosen Experiment needs one `final_models` row with a fitted model artifact.
The artifact is a trusted joblib file containing a dict with keys `"1"`, `"3"`,
`"5"`, each holding a fitted `RandomForestRegressor` with the chosen Experiment's
hyperparameters and five input features. The artifact path must be relative to
`FINAL_MODEL_DIR` (default `BE/artifacts/final_models`), and its SHA-256 must match
the metadata. Artifact creation and Final Model training happen outside this
Predict request. If absent, the API returns `409 FINAL_MODEL_NOT_AVAILABLE`.
`trained_through` must be the latest timestamp of **any label or observation**
used to fit the artifact, so the forecast cannot use a model trained on future
information.
Only trusted operators should write these files because joblib deserializes Python
objects.

The API retrieves the latest five one-minute observations for the selected
dataset version, ROI and Recording Session. Missing, invalid or noncontinuous
observations return 422. It also verifies the Final Model provenance and that
its training cutoff does not follow the forecast origin. It stores the three
predictions in the existing `forecast_results` table, keyed by Final Model,
origin and horizon. Repeated requests for the same origin are idempotent.
The response includes the selected `experiment_id`, `model_id`,
`last_observed_time`, and three entries with `horizon`, `forecast_time` and
`predicted_flow`. An exploratory source Experiment remains exploratory.

The response also includes `last_observed_flow` and a `visualization` object
ready for three frontend views:

- `traffic_flow_chart.history`: exactly five observed one-minute buckets in
  chronological order, with `time` and `traffic_flow`.
- `traffic_flow_chart.forecast`: only the three actual forecast horizons (+1,
  +3, +5); no +2 or +4 values are invented. Each has `horizon`,
  `forecast_time` and `predicted_flow`.
- `forecast_by_horizon`: the same three forecast points for a bar chart.
- `forecast_table`: the same points plus `change_from_last_observed` and
  `trend` (`increase`, `decrease`, `unchanged`), always compared to the final
  **observed** flow value. The frontend can format timestamps and xe/phut units.

These arrays are derived from the lag features and predictions already used
by this request; they do not trigger another database query or model run.

From `BE`, apply the additive database migration before serving Predict:

```powershell
uv run python -m scripts.apply_model_prediction_migration
```

Then run `uv run pytest tests/test_model_prediction.py -q` and
`uv run ruff check .`. Existing legacy forecasts remain in place.
