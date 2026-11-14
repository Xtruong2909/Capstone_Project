# Manual Traffic Flow Prediction

The Data Scientist selects a completed experiment and one or more recording sessions. The backend reads the latest five consecutive 60-second `vehicle_count` bins from each session, calls the shared `latest_lags` function, loads the three saved Random Forest estimators from that experiment, and persists the forecasts. It never fits a model during prediction.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/prediction/experiments` | Eligible completed experiments and their saved Test metrics |
| GET | `/api/prediction/sessions` | Session eligibility, with optional filters and pagination |
| POST | `/api/prediction/forecasts` | Generate and save a manual forecast |
| GET | `/api/prediction/forecasts` | Paginated forecast history |
| GET | `/api/prediction/forecasts/{forecast_id}` | Saved request, models and lag snapshots |
| GET | `/api/prediction/forecasts/{forecast_id}/results` | Paginated forecasts, filtered by session/horizon |
| GET | `/api/prediction/forecasts/{forecast_id}/chart?session_id=...` | Five observed points and selected forecasts |

Apply `migrations/20261128_manual_prediction.sql` to PostgreSQL before starting the new API. The existing experiment, aggregation and legacy prediction APIs remain available.

The origin timestamp is the timestamp of the last observed aggregation bin, matching the timestamp convention in Lag Feature Generation. Forecasts are at origin plus 1, 3 or 5 minutes. Database and API timestamps are UTC; responses identify `Europe/Athens` as the display timezone.

The forecast is a demonstration on selected sessions. If a selected session appeared in training, its forecast must not be interpreted as independent evaluation. Actual counts and forecast errors stay null until a separate, source-verified reconciliation process supplies real observations.

Repeated requests with the same user, experiment, session IDs, current lag values, model artifact checksum and horizons return the saved forecast. A request with some invalid sessions returns `PARTIAL` and per-session errors if at least one session succeeds. If every session fails, the API returns an error and saves no completed run. Negative model outputs are clipped to zero, matching the existing vehicle prediction service; Random Forest regressors trained on nonnegative counts normally cannot emit negative values.
